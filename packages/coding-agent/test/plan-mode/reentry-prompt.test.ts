import { describe, expect, it } from "bun:test";
import { prompt } from "@oh-my-pi/pi-utils";
import planModeActivePrompt from "../../src/prompts/system/plan-mode-active.md" with { type: "text" };

const BASE = {
	planFilePath: "local://old-feature-plan.md",
	askToolName: "ask",
	writeToolName: "write",
	editToolName: "edit",
	isHashlineEditMode: false,
	iterative: false,
	askAvailable: true,
	taskAvailable: true,
	scoutAvailable: true,
	reentry: false,
	planExists: true,
} as const;

type Overrides = Partial<Record<keyof typeof BASE, boolean | string>>;

function render(overrides: Overrides = {}): string {
	return prompt.render(planModeActivePrompt, { ...BASE, ...overrides });
}

describe("plan-mode re-entry prompt", () => {
	it("only emits the Re-entry section when re-entering", () => {
		expect(render({ reentry: false })).not.toContain("## Re-entry");
		expect(render({ reentry: true })).toContain("## Re-entry");
	});
});

describe("plan-mode-active tool availability", () => {
	it("omits ask-tool directives when ask is unavailable", () => {
		const withoutAsk = render({ askAvailable: false, iterative: true });
		expect(withoutAsk).not.toContain("Surface these early via `ask`");
		expect(withoutAsk).not.toContain("use `ask` for preferences and tradeoffs only");
		expect(withoutAsk).not.toContain("Using `ask` to gather requirements");

		const withAsk = render({ askAvailable: true, iterative: true });
		expect(withAsk).toContain("Surface these early via `ask` with 2–4 mutually exclusive options");
		expect(withAsk).toContain("use `ask` for preferences and tradeoffs only");
	});

	it("records preferences as assumptions when ask is unavailable", () => {
		const iterativeWithoutAsk = render({ askAvailable: false, iterative: true });
		expect(iterativeWithoutAsk).toContain("Record them under Assumptions with a recommended default");
		expect(iterativeWithoutAsk).toContain("record preferences and tradeoffs under Assumptions");
		expect(iterativeWithoutAsk).not.toContain("use `ask` for preferences and tradeoffs only");

		const parallelWithoutAsk = render({ askAvailable: false, iterative: false });
		expect(parallelWithoutAsk).toContain(
			"record remaining preference questions under Assumptions with a recommended default",
		);
		// A prose question cannot end the turn in plan mode — no prose-terminal option.
		expect(parallelWithoutAsk).not.toContain("Presenting a choice between approaches");
	});

	it("omits scout-via-task dispatch when the task tool is unavailable", () => {
		const withoutTask = render({ taskAvailable: false, scoutAvailable: true });
		expect(withoutTask).not.toContain("parallel `scout` sisters via `task`");

		const withTask = render({ taskAvailable: true, scoutAvailable: true });
		expect(withTask).toContain("parallel `scout` sisters via `task`");
	});
});
