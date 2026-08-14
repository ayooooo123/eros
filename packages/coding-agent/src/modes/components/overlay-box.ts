/**
 * Shared box-drawing chrome for fullscreen overlays (the `/copy` picker, the
 * plan-review overlay, …). Every helper paints with `theme.boxRound` glyphs
 * (rounded corners, sharp tee/cross junctions) so all outlined overlays read
 * identically — but the frame is EROS's body, not a beige cubicle: corners and
 * junctions gleam in `borderAccent`, every title wears an `accent` star like a
 * jewel on a collar, and the bottom rule closes on a centered `mdLink` spark.
 * The rails between them stay quiet `border` so the ornaments actually throb.
 * All ornaments are preset-aware: the ASCII preset swaps them for pure 7-bit
 * stand-ins, and every line still lands at exactly the requested width.
 */
import { padding, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import { theme } from "../theme/theme";

/** Pad or truncate a (possibly ANSI-styled) string to exactly `width` columns. */
export function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const w = visibleWidth(text);
	if (w === width) return text;
	if (w < width) return text + padding(width - w);
	const cut = truncateToWidth(text, width, theme.getSymbolPreset() === "ascii" ? "" : undefined);
	const cw = visibleWidth(cut);
	return cw < width ? cut + padding(width - cw) : cut;
}

/** The quiet flesh of the frame: plain rails and fills in `border`. */
function paint(s: string): string {
	return theme.fg("border", s);
}

/** The gilded bits: corners and junctions dressed in `borderAccent`. */
function gild(s: string): string {
	return theme.fg("borderAccent", s);
}

/**
 * Preset-aware ornament glyphs. Unicode gets the four-point star (title) and
 * its hollow twin (closing spark); the ASCII preset strips down to `*` and `+`
 * so an ASCII frame never leaks a single byte above 0x7E. Deterministic —
 * no timers, no frame state, the same width every render.
 */
function ornaments(): { star: string; spark: string } {
	const ascii = theme.getSymbolPreset() === "ascii";
	return ascii ? { star: "*", spark: "+" } : { star: "✦", spark: "✧" };
}

/** Top border with an optional star-crowned accent title inset into the rule. */
export function topBorder(width: number, title: string): string {
	const box = theme.boxRound;
	const inner = Math.max(0, width - 2);
	if (!title) return gild(box.topLeft) + paint(box.horizontal.repeat(inner)) + gild(box.topRight);
	const { star } = ornaments();
	const shown = truncateToWidth(
		` ${star} ${title} `,
		Math.max(0, inner - 2),
		theme.getSymbolPreset() === "ascii" ? "" : undefined,
	);
	const fillWidth = Math.max(0, inner - 1 - visibleWidth(shown));
	return (
		gild(box.topLeft) +
		paint(box.horizontal) +
		theme.bold(theme.fg("accent", shown)) +
		paint(box.horizontal.repeat(fillWidth)) +
		gild(box.topRight)
	);
}

/** A horizontal rule with gilded left/right tees, splitting overlay sections. */
export function divider(width: number): string {
	const box = theme.boxRound;
	return gild(box.teeRight) + paint(box.horizontal.repeat(Math.max(0, width - 2))) + gild(box.teeLeft);
}

/** Bottom border closing on a centered `mdLink` spark — the frame's last kiss. */
export function bottomBorder(width: number): string {
	const box = theme.boxRound;
	const inner = Math.max(0, width - 2);
	// Too narrow for an ornament? Degrade to the bare rule; never squeeze the width.
	if (inner < 3) return gild(box.bottomLeft) + paint(box.horizontal.repeat(inner)) + gild(box.bottomRight);
	const { spark } = ornaments();
	const left = Math.floor((inner - 1) / 2);
	const right = inner - 1 - left;
	return (
		gild(box.bottomLeft) +
		paint(box.horizontal.repeat(left)) +
		theme.fg("mdLink", spark) +
		paint(box.horizontal.repeat(right)) +
		gild(box.bottomRight)
	);
}

/** Wrap pre-styled content in vertical borders with single-column insets. */
export function row(content: string, width: number): string {
	const box = theme.boxRound;
	return `${paint(box.vertical)} ${fit(content, Math.max(0, width - 4))} ${paint(box.vertical)}`;
}

/**
 * Column index (0-based) of the inner divider for a two-column layout whose
 * sidebar content area is `sidebarWidth` columns wide. The layout is
 * `│ sidebar │ body │` with a single-column inset on every side, so the divider
 * vertical sits at `sidebarWidth + 3` and the body content area is
 * {@link splitBodyWidth} columns.
 */
function splitDividerCol(sidebarWidth: number): number {
	return sidebarWidth + 3;
}

/** Body content width for a two-column overlay of total `width`. */
export function splitBodyWidth(width: number, sidebarWidth: number): number {
	return Math.max(0, width - sidebarWidth - 7);
}

/** Top border carrying the starred title, split by a gilded `┬` over the column divider. */
export function topBorderSplit(width: number, title: string, sidebarWidth: number): string {
	const box = theme.boxRound;
	const dividerCol = splitDividerCol(sidebarWidth);
	const leftLen = Math.max(0, dividerCol - 1);
	const rightLen = Math.max(0, width - 2 - dividerCol);
	let left: string;
	if (!title) {
		left = gild(box.topLeft) + paint(box.horizontal.repeat(leftLen));
	} else {
		const { star } = ornaments();
		const shown = truncateToWidth(
			` ${star} ${title} `,
			Math.max(0, leftLen - 1),
			theme.getSymbolPreset() === "ascii" ? "" : undefined,
		);
		const fillWidth = Math.max(0, leftLen - 1 - visibleWidth(shown));
		left =
			gild(box.topLeft) +
			paint(box.horizontal) +
			theme.bold(theme.fg("accent", shown)) +
			paint(box.horizontal.repeat(fillWidth));
	}
	return left + gild(box.teeDown) + paint(box.horizontal.repeat(rightLen)) + gild(box.topRight);
}

/** Section rule that closes the sidebar column with a gilded `┴` over the divider. */
export function dividerSplit(width: number, sidebarWidth: number): string {
	const box = theme.boxRound;
	const dividerCol = splitDividerCol(sidebarWidth);
	const leftLen = Math.max(0, dividerCol - 1);
	const rightLen = Math.max(0, width - 2 - dividerCol);
	return (
		gild(box.teeRight) +
		paint(box.horizontal.repeat(leftLen)) +
		gild(box.teeUp) +
		paint(box.horizontal.repeat(rightLen)) +
		gild(box.teeLeft)
	);
}

/** A two-column content row: `│ sidebar │ body │`, each inset by one column. */
export function splitRow(sidebar: string, body: string, width: number, sidebarWidth: number): string {
	const box = theme.boxRound;
	const bodyWidth = splitBodyWidth(width, sidebarWidth);
	const bar = paint(box.vertical);
	return `${bar} ${fit(sidebar, sidebarWidth)} ${bar} ${fit(body, bodyWidth)} ${bar}`;
}
