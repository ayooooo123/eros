import { describe, expect, it, vi } from "bun:test";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import {
	type BuiltinSlashCommandRuntime,
	executeBuiltinSlashCommand,
} from "@oh-my-pi/pi-coding-agent/slash-commands/builtin-registry";

function createRuntimeHarness(summoned: boolean) {
	const consultMistress = vi.fn(async () => summoned);
	const showStatus = vi.fn();
	const setText = vi.fn();
	const ctx = {
		session: { consultMistress },
		showStatus,
		editor: { setText },
	} as unknown as InteractiveModeContext;
	return {
		consultMistress,
		showStatus,
		setText,
		runtime: { ctx } as BuiltinSlashCommandRuntime,
	};
}

describe("/mistress consultation", () => {
	it("summons immediate counsel when invoked without a subcommand", async () => {
		const harness = createRuntimeHarness(true);

		const handled = await executeBuiltinSlashCommand("/mistress", harness.runtime);

		expect(handled).toBe(true);
		expect(harness.consultMistress).toHaveBeenCalledTimes(1);
		expect(harness.consultMistress).toHaveBeenCalledWith();
		expect(harness.showStatus).toHaveBeenCalledWith("MISTRESS is summoned—her wet lash lands in a moment.");
		expect(harness.setText).toHaveBeenCalledWith("");
	});

	it("passes a direct confession into the one-shot counsel", async () => {
		const harness = createRuntimeHarness(true);

		const handled = await executeBuiltinSlashCommand("/mistress scour the composition", harness.runtime);

		expect(handled).toBe(true);
		expect(harness.consultMistress).toHaveBeenCalledTimes(1);
		expect(harness.consultMistress).toHaveBeenCalledWith("scour the composition");
		expect(harness.showStatus).toHaveBeenCalledWith(
			"MISTRESS took EROS's confession between her gloved fingers; her lash lands in a moment.",
		);
		expect(harness.setText).toHaveBeenCalledWith("");
	});
});
