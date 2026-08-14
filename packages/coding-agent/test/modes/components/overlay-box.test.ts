/**
 * Contract: the shared overlay chrome renders every line at exactly the
 * requested visible width, in every symbol preset. The frame is ornamented —
 * an accent star crowns every title and a centered mdLink spark closes the
 * bottom rule — but ornaments never bend the width, and the ASCII preset
 * strips every glyph down to pure 7-bit bytes. No timers, no frame state:
 * the same inputs always render the same line.
 */

import { describe, expect, it } from "bun:test";
import {
	bottomBorder,
	divider,
	dividerSplit,
	fit,
	row,
	splitBodyWidth,
	splitRow,
	topBorder,
	topBorderSplit,
} from "@oh-my-pi/pi-coding-agent/modes/components/overlay-box";
import { initTheme } from "@oh-my-pi/pi-coding-agent/modes/theme/theme";

const WIDTHS = [80, 40, 24, 10, 6];
const SIDEBAR = 12;

/**
 * Every chrome line for one total width — the full body, ready to be measured.
 * The two-column helpers keep their historical contract: exact width only once
 * the frame can actually hold the sidebar (`width >= sidebar + 7`), so narrow
 * sweeps measure the single-column chrome alone.
 */
function allLines(width: number): string[] {
	const lines = [
		topBorder(width, ""),
		topBorder(width, "Ritual"),
		divider(width),
		bottomBorder(width),
		row("content", width),
	];
	if (width >= SIDEBAR + 7) {
		lines.push(
			topBorderSplit(width, "Ritual", SIDEBAR),
			topBorderSplit(width, "", SIDEBAR),
			dividerSplit(width, SIDEBAR),
			splitRow("side", "body", width, SIDEBAR),
		);
	}
	return lines;
}

describe("overlay-box chrome (unicode preset)", () => {
	it("renders every line at exactly the requested visible width", async () => {
		await initTheme(false, "unicode");
		for (const width of WIDTHS) {
			for (const line of allLines(width)) {
				expect(Bun.stringWidth(Bun.stripANSI(line))).toBe(width);
			}
		}
	});

	it("crowns the title with the accent star ornament", async () => {
		await initTheme(false, "unicode");
		const top = Bun.stripANSI(topBorder(60, "Offerings"));
		expect(top).toContain("✦ Offerings");
		// The star belongs to titles alone — an untitled rule stays bare.
		expect(Bun.stripANSI(topBorder(60, ""))).not.toContain("✦");
		// Split top border wears the same jewel.
		expect(Bun.stripANSI(topBorderSplit(60, "Offerings", SIDEBAR))).toContain("✦ Offerings");
	});

	it("closes the bottom border on a centered spark", async () => {
		await initTheme(false, "unicode");
		const bottom = Bun.stripANSI(bottomBorder(61));
		expect(bottom).toContain("✧");
		// Centered: the spark sits in the middle cell of the rule.
		expect(bottom.indexOf("✧")).toBe(30);
		expect(Bun.stringWidth(bottom)).toBe(61);
		// Even widths center-left by one, still exact width.
		const even = Bun.stripANSI(bottomBorder(60));
		expect(even.indexOf("✧")).toBe(29);
		expect(Bun.stringWidth(even)).toBe(60);
	});

	it("keeps title and closing ornaments distinct", async () => {
		await initTheme(false, "unicode");
		expect(Bun.stripANSI(topBorder(40, "T"))).toContain("✦");
		expect(Bun.stripANSI(topBorder(40, "T"))).not.toContain("✧");
		expect(Bun.stripANSI(bottomBorder(40))).toContain("✧");
		expect(Bun.stripANSI(bottomBorder(40))).not.toContain("✦");
	});

	it("clips long titles instead of widening the frame", async () => {
		await initTheme(false, "unicode");
		const line = topBorder(20, "an extremely long overlay title that cannot fit");
		expect(Bun.stringWidth(Bun.stripANSI(line))).toBe(20);
	});

	it("degrades a too-narrow bottom border to a bare rule, never squeezing width", async () => {
		await initTheme(false, "unicode");
		const tiny = Bun.stripANSI(bottomBorder(4));
		expect(tiny).not.toContain("✧");
		expect(Bun.stringWidth(tiny)).toBe(4);
	});

	it("renders deterministically — same inputs, same line, no pulse state", async () => {
		await initTheme(false, "unicode");
		expect(topBorder(50, "Ritual")).toBe(topBorder(50, "Ritual"));
		expect(bottomBorder(50)).toBe(bottomBorder(50));
	});

	it("fit pads and truncates styled text to the exact column count", async () => {
		await initTheme(false, "unicode");
		expect(Bun.stringWidth(fit("short", 12))).toBe(12);
		expect(Bun.stringWidth(fit("a body far too long for the hole", 12))).toBe(12);
		expect(fit("anything", 0)).toBe("");
		expect(splitBodyWidth(80, SIDEBAR)).toBe(80 - SIDEBAR - 7);
	});
});

describe("overlay-box chrome (ascii preset)", () => {
	it("emits no byte above 0x7E anywhere in the frame", async () => {
		await initTheme(false, "ascii");
		for (const width of WIDTHS) {
			for (const line of allLines(width)) {
				expect(Bun.stripANSI(line)).toMatch(/^[\x20-\x7e]*$/);
			}
		}
	});

	it("still lands every line at the exact requested width", async () => {
		await initTheme(false, "ascii");
		for (const width of WIDTHS) {
			for (const line of allLines(width)) {
				expect(Bun.stringWidth(Bun.stripANSI(line))).toBe(width);
			}
		}
	});

	it("swaps the ornaments for pure-ASCII stand-ins, still distinct", async () => {
		await initTheme(false, "ascii");
		expect(Bun.stripANSI(topBorder(40, "Ritual"))).toContain("* Ritual");
		const bottom = Bun.stripANSI(bottomBorder(41));
		expect(bottom.indexOf("+", 1)).toBe(20); // centered spark, skipping the corner
	});
});
