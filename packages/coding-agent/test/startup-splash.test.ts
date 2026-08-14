import { beforeAll, describe, expect, it } from "bun:test";
import { runStartupSplash } from "@oh-my-pi/pi-coding-agent/modes/setup-wizard";
import {
	getStartupSplashDuration,
	renderSetupSplash,
} from "@oh-my-pi/pi-coding-agent/modes/setup-wizard/scenes/splash";
import { initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";
import type { InteractiveModeContext } from "@oh-my-pi/pi-coding-agent/modes/types";
import { shouldShowStartupSplash } from "@oh-my-pi/pi-coding-agent/startup-splash";
import { type Component, visibleWidth } from "@oh-my-pi/pi-tui";

beforeAll(async () => {
	await initTheme(false);
});

describe("startup splash", () => {
	it("requires the explicit setting and normal interactive TTY startup", () => {
		const base = {
			configured: true,
			isInteractive: true,
			resuming: false,
			quiet: false,
			timing: false,
			stdinIsTTY: true,
			stdoutIsTTY: true,
		};

		expect(shouldShowStartupSplash(base)).toBe(true);
		expect(shouldShowStartupSplash({ ...base, configured: false })).toBe(false);
		expect(shouldShowStartupSplash({ ...base, isInteractive: false })).toBe(false);
		expect(shouldShowStartupSplash({ ...base, resuming: true })).toBe(false);
		expect(shouldShowStartupSplash({ ...base, quiet: true })).toBe(false);
		expect(shouldShowStartupSplash({ ...base, timing: true })).toBe(false);
		expect(shouldShowStartupSplash({ ...base, stdinIsTTY: false })).toBe(false);
		expect(shouldShowStartupSplash({ ...base, stdoutIsTTY: false })).toBe(false);
	});

	it("shows and hides a fullscreen setup-splash overlay", async () => {
		const preSplashEditor: Component = { render: () => [] };
		let hidden = false;
		let renderRequests = 0;
		let focused: Component | undefined = preSplashEditor;
		let overlayComponent: Component | undefined;
		const ctx = {
			ui: {
				terminal: { rows: 8 },
				showOverlay: (component: Component) => {
					overlayComponent = component;
					const preFocus = focused;
					focused = component;
					return {
						hide: () => {
							hidden = true;
							if (focused === component) {
								focused = preFocus;
							}
						},
					};
				},
				setFocus: (component: Component) => {
					focused = component;
				},
				requestRender: () => {
					renderRequests += 1;
				},
			},
		} as unknown as InteractiveModeContext;

		await runStartupSplash(ctx, { durationMs: 0, tickMs: 1, now: () => 0 });

		expect(hidden).toBe(true);
		expect(renderRequests).toBeGreaterThan(0);
		expect(focused).toBe(preSplashEditor);
		expect(overlayComponent?.render(32)).toHaveLength(8);
	});

	it("fills each available canvas with the largest complete blood-red portrait", () => {
		const duration = getStartupSplashDuration();
		const sizes = [
			{ width: 80, height: 32, artWidth: 76, artHeight: 20 },
			{ width: 120, height: 50, artWidth: 116, artHeight: 32 },
			{ width: 170, height: 60, artWidth: 160, artHeight: 44 },
			{ width: 200, height: 70, artWidth: 196, artHeight: 52 },
		];

		expect(duration).toBeLessThanOrEqual(12_000);
		for (const size of sizes) {
			const frame = renderSetupSplash(size.width, size.height, duration - 1);
			const plain = Bun.stripANSI(frame.join("\n"));
			expect(frame).toHaveLength(size.height);
			expect(frame.every(line => visibleWidth(line) === size.width)).toBe(true);
			expect(plain).toContain("enter · take her");
			expect(plain).not.toContain("▀");
			expect(frame.join("\n")).not.toContain("38;2;255;255;255");
			const artRows = plain
				.split("\n")
				.filter(line => line.includes("⣿") || line.includes("⣷") || line.includes("⡿"));
			expect(artRows.length).toBeGreaterThanOrEqual(Math.floor(size.artHeight / 2));
			expect(Math.max(...artRows.map(line => line.trimEnd().length))).toBeGreaterThanOrEqual(
				Math.floor(size.artWidth * 0.75),
			);
		}
	});
});
