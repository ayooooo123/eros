import { afterEach, beforeAll, describe, expect, it, vi } from "bun:test";
import { Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import {
	pickWeightedTip,
	WELCOME_EDITOR_RESERVATION_ROWS,
	WelcomeComponent,
} from "@oh-my-pi/pi-coding-agent/modes/components/welcome";
import { EROS_TITLE } from "@oh-my-pi/pi-coding-agent/modes/setup-wizard/scenes/splash";
import { initTheme, theme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import { visibleWidth } from "@oh-my-pi/pi-tui";

function stubStdoutRows(rows: number): () => void {
	const descriptor = Object.getOwnPropertyDescriptor(process.stdout, "rows");
	Object.defineProperty(process.stdout, "rows", { configurable: true, get: () => rows });
	return () => {
		if (descriptor) Object.defineProperty(process.stdout, "rows", descriptor);
		else Reflect.deleteProperty(process.stdout, "rows");
	};
}

describe("WelcomeComponent", () => {
	beforeAll(async () => {
		await Settings.init({ inMemory: true });
		await initTheme(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("selects standard tip when preset is not unicode", () => {
		vi.spyOn(theme, "getSymbolPreset").mockReturnValue("nerd");

		const welcome = new WelcomeComponent("1.0.0", "model", "provider");
		expect(welcome.tip).not.toBe("Nerd Font gives her ornaments sharper teeth.");
		expect(welcome.tip).toBeDefined();
	});

	it("selects nerdfont tip with 10% probability under unicode preset", () => {
		vi.spyOn(theme, "getSymbolPreset").mockReturnValue("unicode");

		// 9% chance => selects the sharp-ornament whisper
		vi.spyOn(Math, "random").mockReturnValue(0.09);
		const welcomeSpecial = new WelcomeComponent("1.0.0", "model", "provider");
		expect(welcomeSpecial.tip).toBe("Nerd Font gives her ornaments sharper teeth.");

		// 10% chance => selects a regular whisper
		vi.spyOn(Math, "random").mockReturnValue(0.1);
		const welcomeRegular = new WelcomeComponent("1.0.0", "model", "provider");
		expect(welcomeRegular.tip).not.toBe("Nerd Font gives her ornaments sharper teeth.");
		expect(welcomeRegular.tip).toBeDefined();
	});

	it("sweeps the full-width altar without changing terminal geometry", () => {
		const now = vi.spyOn(performance, "now").mockReturnValue(0);
		const welcome = new WelcomeComponent("1.0.0", "model", "provider");
		welcome.playIntro(() => {});
		const opening = welcome.render(80);

		now.mockReturnValue(1500);
		const midStroke = welcome.render(80);

		expect(midStroke).not.toEqual(opening);
		expect([...opening, ...midStroke].every(line => visibleWidth(line) <= 80)).toBe(true);
		welcome.settleAfterFirstPrompt();
	});

	it("weights [NEW] tips above ordinary tips in selection", () => {
		// Data-independent: tips.txt may legitimately carry zero "[NEW]" tips, so
		// exercise the weighting contract on a synthetic list.
		const tips = ["plain one", "shiny thing [NEW]", "plain two"] as const;

		const counts = new Map<string, number>();
		const samples = 10_000;
		for (let i = 0; i < samples; i++) {
			const tip = pickWeightedTip(tips, (i + 0.5) / samples); // sweep the selection domain uniformly
			counts.set(tip, (counts.get(tip) ?? 0) + 1);
		}

		let newMax = 0;
		let ordinaryMax = 0;
		for (const [tip, count] of counts) {
			if (/\[NEW\]\s*$/.test(tip)) newMax = Math.max(newMax, count);
			else ordinaryMax = Math.max(ordinaryMax, count);
		}

		// A "[NEW]" tip carries a >1 weight, so it covers strictly more of the
		// uniform selection domain than any single ordinary tip.
		expect(newMax).toBeGreaterThan(0);
		expect(newMax).toBeGreaterThan(ordinaryMax);
		expect(pickWeightedTip([], 0.5)).toBe("");
	});

	it("freezes the complete altar after submission instead of collapsing it", () => {
		const restoreRows = stubStdoutRows(48);
		vi.useFakeTimers();
		const welcome = new WelcomeComponent("1.0.0", "model", "provider");
		try {
			welcome.startAltar(() => {});
			vi.advanceTimersByTime(160);
			const beforeSubmission = welcome.render(120).map(Bun.stripANSI);
			welcome.settleAfterFirstPrompt();
			const frozen = welcome.render(120).map(Bun.stripANSI);
			vi.advanceTimersByTime(800);
			const afterTime = welcome.render(120).map(Bun.stripANSI);

			expect(welcome.isAltarLive).toBe(false);
			expect(frozen).toEqual(beforeSubmission);
			expect(afterTime).toEqual(frozen);
			expect(frozen).toHaveLength(48 - WELCOME_EDITOR_RESERVATION_ROWS);
			expect(frozen.join("\n")).toContain(EROS_TITLE);
			expect(frozen.join("\n")).toContain("type to use her");
			expect(frozen.join("\n")).toMatch(/[⠀-⣿]/u);
		} finally {
			welcome.settleAfterFirstPrompt();
			vi.useRealTimers();
			restoreRows();
		}
	});
});
