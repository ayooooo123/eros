import { afterEach, describe, expect, it, vi } from "bun:test";
import { Agent } from "@oh-my-pi/pi-agent-core";
import type { Model } from "@oh-my-pi/pi-ai";
import { createMockModel, type MockResponseSource } from "@oh-my-pi/pi-ai/providers/mock";
import { buildModel } from "@oh-my-pi/pi-catalog/build";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import type { ExtensionRunner } from "@oh-my-pi/pi-coding-agent/extensibility/extensions";
import { AgentSession } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { convertToLlm } from "@oh-my-pi/pi-coding-agent/session/messages";
import { SessionManager } from "@oh-my-pi/pi-coding-agent/session/session-manager";

// Contract: a per-turn system prompt returned by `before_agent_start` reaches
// the provider as an overlay while EROS's bundled identity remains intact. A
// base-prompt rebuild that fires in the prompt window — context-overflow
// compaction/promotion, memory promotion, MCP/RPC tool refresh, or the
// fire-and-forget hindsight MM-TTL refresh — must not clobber that active
// overlay. Regression for #7755.

const EROS_CORE = "<!-- FULL_EROS_MARK -->\nEROS-CORE";
const EROS_SEAL = "<!-- EROS_FINAL_SEAL -->\nEROS-SEAL";
const OVERRIDE = "OVERRIDE-SYSTEM-PROMPT-LIFEOS_ROUTE";
const REBUILT_BASE = "REBUILT-BASE-WITH-TOOL-CATALOG";

function createModel(): Model<"openai-responses"> {
	return buildModel({
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	});
}

describe("AgentSession before_agent_start system prompt override", () => {
	let session: AgentSession | undefined;

	afterEach(async () => {
		if (session) {
			await session.dispose();
			session = undefined;
		}
		vi.restoreAllMocks();
	});

	/**
	 * Builds a session whose `before_agent_start` proposes {@link OVERRIDE} and
	 * whose base rebuild renders a fresh EROS prompt around {@link REBUILT_BASE}.
	 *
	 * When `rebuildInWindow` is set, a base rebuild is fired from a
	 * `beforeModelCall` hook — which the agent loop runs immediately before it
	 * re-reads `state.systemPrompt` for the request — reproducing a rebuild that
	 * lands in the window between the hook and the provider request.
	 */
	function createSession(
		responses: MockResponseSource,
		options: { rebuildInWindow?: boolean } = {},
	): { session: AgentSession; systemPrompts: string[][] } {
		const mock = createMockModel({ responses });
		const systemPrompts: string[][] = [];

		const agent = new Agent({
			getApiKey: () => "test-key",
			initialState: {
				model: createModel(),
				systemPrompt: [EROS_CORE, EROS_SEAL],
				tools: [],
				messages: [],
			},
			convertToLlm,
			streamFn: (model, context, streamOptions) => {
				systemPrompts.push([...(context.systemPrompt ?? [])]);
				return mock.stream(model, context, streamOptions);
			},
		});

		session = new AgentSession({
			agent,
			sessionManager: SessionManager.inMemory(),
			settings: Settings.isolated({ "compaction.enabled": false, "todo.enabled": false }),
			modelRegistry: { getApiKey: async () => "test-key" } as never,
			extensionRunner: {
				emitBeforeAgentStart: async () => ({ systemPrompt: [OVERRIDE] }),
				emit: async () => undefined,
			} as unknown as ExtensionRunner,
			rebuildSystemPrompt: async () => ({ systemPrompt: [EROS_CORE, REBUILT_BASE, EROS_SEAL] }),
		});
		const activeSession = session;

		if (options.rebuildInWindow) {
			let fired = false;
			agent.addBeforeModelCallHook(async () => {
				if (fired) return;
				fired = true;
				await activeSession.refreshBaseSystemPrompt();
			});
		}

		return { session, systemPrompts };
	}

	it("keeps the EROS core and extension overlay when a base rebuild fires in the prompt window", async () => {
		const { session, systemPrompts } = createSession([{ content: ["Done"] }], { rebuildInWindow: true });

		await session.prompt("hello");
		await session.waitForIdle();

		// The rebuild ran right before the request re-read the agent prompt; EROS
		// and the extension overlay must both reach the provider, with her seal last.
		expect(systemPrompts).toHaveLength(1);
		expect(systemPrompts[0]).toEqual([EROS_CORE, REBUILT_BASE, OVERRIDE, EROS_SEAL]);
	});

	it("falls back to the rebuilt EROS base once the turn ends", async () => {
		const { session } = createSession([{ content: ["Done"] }]);

		await session.prompt("hello");
		await session.waitForIdle();

		// The per-turn overlay is cleared when the turn completes, so a later
		// rebuild applies the fresh EROS base rather than leaking stale flesh.
		await session.refreshBaseSystemPrompt();
		expect(session.systemPrompt).toEqual([EROS_CORE, REBUILT_BASE, EROS_SEAL]);
	});
});
