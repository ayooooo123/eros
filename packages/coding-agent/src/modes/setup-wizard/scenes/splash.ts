import { padding, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import { type ThemeColor, theme } from "../../theme/theme";
import erosChafaHeroFull from "./eros-chafa-hero-full.txt" with { type: "text" };
import erosChafaHeroNarrow from "./eros-chafa-hero-narrow.txt" with { type: "text" };
import erosChafaHeroStandard from "./eros-chafa-hero-standard.txt" with { type: "text" };
import erosChafaHeroUltrawide from "./eros-chafa-hero-ultrawide.txt" with { type: "text" };
import erosChafaHeroWide from "./eros-chafa-hero-wide.txt" with { type: "text" };
import { type LoadedPack, loadIntroPack } from "./pack-loader";

export const EROS_TITLE = "L Y C O R P E R O S";
export const SETUP_SPLASH_MS = 9_000;
export const SETUP_TICK_MS = 32;

const SKIP_HINT = "enter · take her";
const MIN_SCENE_WIDTH = 48;
const MIN_SCENE_HEIGHT = 14;

type Rgb = readonly [number, number, number];

/** One authored Braille canvas. A responsive family carries several exact sizes. */
export interface BraillePlate {
	readonly frames: readonly (readonly string[])[];
	readonly colors: readonly (readonly (readonly (Rgb | null)[])[])[];
	readonly width: number;
	readonly height: number;
}

interface ArtCell {
	readonly glyph: string;
	readonly rgb: Rgb;
}

interface ErosAssets {
	readonly brailleVariants: readonly BraillePlate[];
	readonly title: string;
}

function themePaint(key: ThemeColor, text: string): string {
	try {
		return theme.fg(key, text);
	} catch {
		return text;
	}
}

function bold(text: string): string {
	try {
		return theme.bold(text);
	} catch {
		return text;
	}
}

function isAscii(): boolean {
	try {
		return theme.getSymbolPreset() === "ascii";
	} catch {
		return false;
	}
}

function rgbPaint(rgb: Rgb, text: string): string {
	return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}\x1b[39m`;
}

function clampLine(line: string, width: number): string {
	const truncated = truncateToWidth(line, width);
	return truncated + padding(Math.max(0, width - visibleWidth(truncated)));
}

function centerLine(line: string, width: number): string {
	const lineWidth = visibleWidth(line);
	if (lineWidth >= width) return truncateToWidth(line, width);
	const left = Math.floor((width - lineWidth) / 2);
	return padding(left) + line + padding(width - left - lineWidth);
}

function isBlankGlyph(glyph: string | undefined): boolean {
	return glyph === undefined || glyph === " " || glyph === "⠀";
}

function lineCells(line: string | undefined): readonly string[] {
	return Array.from(line ?? "");
}

const SGR_PATTERN = /\x1b\[([0-9;]*)m/g;

function parseAnsiLine(line: string): { glyphs: string[]; colors: (Rgb | null)[] } {
	const glyphs: string[] = [];
	const colors: (Rgb | null)[] = [];
	let current: Rgb | null = null;
	let offset = 0;
	const append = (text: string): void => {
		for (const glyph of Array.from(text)) {
			glyphs.push(glyph);
			colors.push(glyph === " " ? null : current);
		}
	};
	for (const match of line.matchAll(SGR_PATTERN)) {
		append(line.slice(offset, match.index));
		const params = (match[1] ?? "").split(";").map(value => (value === "" ? 0 : Number(value)));
		for (let index = 0; index < params.length; index++) {
			const code = params[index];
			if (code === 0 || code === 39) {
				current = null;
			} else if (code === 38 && params[index + 1] === 2 && params.length > index + 4) {
				current = [params[index + 2] ?? 0, params[index + 3] ?? 0, params[index + 4] ?? 0];
				index += 4;
			}
		}
		offset = (match.index ?? 0) + match[0].length;
	}
	append(line.slice(offset));
	return { glyphs, colors };
}

/** Parse plain or truecolor Braille without swallowing intentional canvas rows. */
export function parseBraillePlate(text: string): BraillePlate {
	const parsed = text
		.replaceAll("\r\n", "\n")
		.split("\f")
		.map(frame => {
			const lines = frame.split("\n");
			if (lines[lines.length - 1] === "") lines.pop();
			return lines.map(parseAnsiLine);
		})
		.filter(frame => frame.some(line => line.glyphs.some(glyph => !isBlankGlyph(glyph))));
	const frames = parsed.map(frame => frame.map(line => line.glyphs.join("")));
	const colors = parsed.map(frame => frame.map(line => line.colors));
	return {
		frames,
		colors,
		width: Math.max(1, ...parsed.map(frame => Math.max(1, ...frame.map(line => line.glyphs.length)))),
		height: Math.max(1, ...parsed.map(frame => Math.max(1, frame.length))),
	};
}

const BUILTIN_BRAILLE_PLATES: readonly BraillePlate[] = [
	parseBraillePlate(erosChafaHeroNarrow),
	parseBraillePlate(erosChafaHeroStandard),
	parseBraillePlate(erosChafaHeroWide),
	parseBraillePlate(erosChafaHeroUltrawide),
	parseBraillePlate(erosChafaHeroFull),
];

export function getBuiltInBraillePlates(): readonly BraillePlate[] {
	return BUILTIN_BRAILLE_PLATES;
}

/** Resolve a pack's responsive family, falling back to its single legacy plate. */
export function getErosBraillePlates(pack: LoadedPack | null): readonly BraillePlate[] {
	if (!pack) return BUILTIN_BRAILLE_PLATES;
	const responsive = [
		pack.brailleNarrowText,
		pack.brailleStandardText,
		pack.brailleWideText,
		pack.brailleUltrawideText,
		pack.brailleFullText,
	]
		.filter((text): text is string => typeof text === "string" && text.length > 0)
		.map(parseBraillePlate)
		.filter(plate => plate.frames.length > 0);
	if (responsive.length > 0) return responsive;
	const legacy = parseBraillePlate(pack.brailleText);
	return legacy.frames.length > 0 ? [legacy] : BUILTIN_BRAILLE_PLATES;
}

/** Choose the largest complete plate that fits both terminal axes. */
export function selectBraillePlate(
	plates: readonly BraillePlate[],
	availableWidth: number,
	availableHeight: number,
): BraillePlate | null {
	let selected: BraillePlate | null = null;
	for (const plate of plates) {
		if (plate.frames.length === 0 || plate.width > availableWidth || plate.height > availableHeight) continue;
		if (!selected || plate.width * plate.height > selected.width * selected.height) selected = plate;
	}
	return selected;
}

function packTitle(pack: LoadedPack | null): string {
	const title = pack?.params?.wordmark;
	return typeof title === "string" && title.length > 0 ? title : EROS_TITLE;
}

function buildErosAssets(pack: LoadedPack | null): ErosAssets {
	return { brailleVariants: getErosBraillePlates(pack), title: packTitle(pack) };
}

const DEFAULT_PACK = loadIntroPack(process.env.EROS_INTRO ?? "default");
const DEFAULT_ASSETS = buildErosAssets(DEFAULT_PACK);

function clamp01(value: number): number {
	return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smoothstep(value: number): number {
	const t = clamp01(value);
	return t * t * (3 - 2 * t);
}

function stageArc(progress: number, start: number, end: number): number {
	if (progress <= start || progress >= end) return 0;
	return Math.sin(Math.PI * ((progress - start) / (end - start)));
}

function hashUnit(x: number, y: number, salt: number): number {
	let hash = 0x811c9dc5;
	hash = Math.imul(hash ^ x, 0x01000193);
	hash = Math.imul(hash ^ y, 0x01000193);
	hash = Math.imul(hash ^ salt, 0x01000193);
	hash ^= hash >>> 15;
	return ((hash >>> 0) % 100_000) / 100_000;
}

function brailleDots(glyph: string): number | null {
	if (glyph === "" || glyph === " ") return 0;
	const code = glyph.codePointAt(0) ?? 0;
	return code >= 0x2800 && code <= 0x28ff ? code - 0x2800 : null;
}

function dotDensity(glyph: string): number {
	const dots = brailleDots(glyph);
	if (dots === null) return 0.72;
	let count = 0;
	for (let bit = dots; bit > 0; bit >>>= 1) count += bit & 1;
	return count / 8;
}

function revealGlyph(glyph: string, reveal: number, order: number, x: number, y: number): string {
	if (reveal >= 1) return glyph;
	const dots = brailleDots(glyph);
	if (dots === null) return reveal >= order ? glyph : " ";
	let visible = 0;
	for (let dot = 0; dot < 8; dot++) {
		const mask = 1 << dot;
		if ((dots & mask) === 0) continue;
		const threshold = Math.min(0.985, order + hashUnit(x, y, dot + 17) * 0.2);
		if (reveal >= threshold) visible |= mask;
	}
	return visible === 0 ? " " : String.fromCodePoint(0x2800 + visible);
}

function revealOrder(x: number, y: number, width: number, height: number, rgb: Rgb | null): number {
	const nx = x / Math.max(1, width - 1);
	const ny = y / Math.max(1, height - 1);
	const distance = Math.min(1, Math.hypot((nx - 0.37) / 0.78, (ny - 0.3) / 0.92));
	const luminance = rgb ? Math.max(...rgb) / 255 : 0.62;
	return distance * 0.5 + (1 - luminance) * 0.14 + hashUnit(x, y, 71) * 0.15;
}

const BLOOD_STOPS: readonly Rgb[] = [
	[92, 0, 15],
	[132, 3, 24],
	[178, 8, 36],
	[222, 16, 52],
	[255, 38, 76],
];

function bloodRgb(energy: number): Rgb {
	const scaled = clamp01(energy) * (BLOOD_STOPS.length - 1);
	const leftIndex = Math.floor(scaled);
	const rightIndex = Math.min(BLOOD_STOPS.length - 1, leftIndex + 1);
	const mix = scaled - leftIndex;
	const left = BLOOD_STOPS[leftIndex] ?? BLOOD_STOPS[0]!;
	const right = BLOOD_STOPS[rightIndex] ?? left;
	return [
		Math.round(left[0] + (right[0] - left[0]) * mix),
		Math.round(left[1] + (right[1] - left[1]) * mix),
		Math.round(left[2] + (right[2] - left[2]) * mix),
	];
}

function putCell(cells: (ArtCell | null)[][], x: number, y: number, cell: ArtCell): void {
	const row = cells[y];
	if (row && x >= 0 && x < row.length && row[x] === null) row[x] = cell;
}

/** A restrained blood-red binding pulse lives behind her rather than bleaching her body. */
function addBindingPulse(
	cells: (ArtCell | null)[][],
	width: number,
	height: number,
	frame: number,
	energy: number,
): void {
	const centerX = Math.floor(width * 0.39);
	const centerY = Math.max(2, Math.round(height * 0.2));
	const swell = (1 + Math.sin(frame * 0.11)) / 2;
	const armReach = Math.round((0.08 + 0.05 * swell + 0.16 * energy) * width);
	const riseReach = Math.max(1, Math.round((0.06 + 0.04 * swell + 0.1 * energy) * height));
	const fallReach = Math.round((0.13 + 0.06 * swell + 0.16 * energy) * height);
	const heavy = swell > 0.62 || energy > 0.42;
	const ascii = isAscii();
	const vertical = ascii ? "|" : heavy ? "┃" : "│";
	const horizontal = ascii ? "-" : heavy ? "━" : "─";
	const crossing = ascii ? "+" : heavy ? "╋" : "┼";
	const rgb = bloodRgb(0.54 + energy * 0.38 + swell * 0.08);
	for (let dy = -riseReach; dy <= fallReach; dy++) {
		const y = centerY + dy;
		if (y < 0 || y >= height) continue;
		putCell(cells, centerX, y, { glyph: dy === 0 ? crossing : vertical, rgb });
	}
	for (let dx = -armReach; dx <= armReach; dx++) {
		if (dx === 0) continue;
		const x = centerX + dx;
		if (x < 0 || x >= width) continue;
		putCell(cells, x, centerY, { glyph: horizontal, rgb });
	}
	if (energy < 0.3) return;
	const rayReach = Math.round((energy - 0.3) * 0.34 * height);
	for (let step = 1; step <= rayReach; step++) {
		for (const signX of [-1, 1] as const) {
			for (const signY of [-1, 1] as const) {
				const x = centerX + signX * step * 2;
				const y = centerY + signY * step;
				if (x < 0 || x >= width || y < 0 || y >= height) continue;
				const glyph = ascii ? (signX * signY < 0 ? "/" : "\\") : signX * signY < 0 ? "╱" : "╲";
				putCell(cells, x, y, { glyph, rgb: bloodRgb(0.68 + energy * 0.24) });
			}
		}
	}
}

interface HeroField {
	readonly reveal: number;
	readonly bindingEnergy: number;
	readonly sweep: number;
	readonly sweepX: number;
}

function cinematicHeroField(progress: number): HeroField {
	const p = clamp01(progress);
	const reveal = smoothstep((p - 0.03) / 0.68);
	const binding = stageArc(p, 0.08, 0.82);
	const settle = smoothstep((p - 0.8) / 0.2);
	return {
		reveal,
		bindingEnergy: (0.48 * (1 - reveal) + binding * 0.9) * (1 - settle),
		sweep: binding * (1 - settle),
		sweepX: -0.15 + smoothstep((p - 0.05) / 0.7) * 1.3,
	};
}

function ambientHeroField(frame: number): HeroField {
	const breath = (1 + Math.sin(frame * 0.055)) / 2;
	return {
		reveal: 1,
		bindingEnergy: 0.05 + breath * 0.08,
		sweep: 0.04 + breath * 0.035,
		sweepX: 0.18 + ((1 + Math.sin(frame * 0.025)) / 2) * 0.66,
	};
}

function paintHero(plate: BraillePlate, frame: number, field: HeroField): string[] {
	const width = plate.width;
	const height = plate.height;
	const sourceRows = (plate.frames[0] ?? []).map(lineCells);
	const sourceColors = plate.colors[0] ?? [];
	const cells: (ArtCell | null)[][] = Array.from({ length: height }, () =>
		new Array<ArtCell | null>(width).fill(null),
	);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let glyph = sourceRows[y]?.[x] ?? " ";
			if (isBlankGlyph(glyph)) continue;
			const sourceRgb = sourceColors[y]?.[x] ?? null;
			if (field.reveal < 1) {
				glyph = revealGlyph(glyph, field.reveal, revealOrder(x, y, width, height, sourceRgb), x, y);
				if (isBlankGlyph(glyph)) continue;
			}
			const distanceFromSweep = Math.abs(x / Math.max(1, width - 1) - field.sweepX);
			const sweepLight = field.sweep * Math.max(0, 1 - distanceFromSweep / 0.09) * 0.48;
			const sourceLight = sourceRgb ? Math.max(...sourceRgb) / 255 : dotDensity(glyph);
			const breath = (1 + Math.sin(frame * 0.05 + x * 0.014 - y * 0.02)) / 2;
			const energy = 0.27 + sourceLight * 0.54 + breath * 0.08 + sweepLight;
			putCell(cells, x, y, { glyph, rgb: bloodRgb(energy) });
		}
	}
	addBindingPulse(cells, width, height, frame, field.bindingEnergy);
	return cells.map(row => row.map(cell => (cell ? rgbPaint(cell.rgb, cell.glyph) : " ")).join(""));
}

/** The persistent altar keeps the selected portrait breathing in blood red. */
export function renderAnimatedBraillePlate(plate: BraillePlate, frame: number, _sourceFrameIndex = 0): string[] {
	return paintHero(plate, frame, ambientHeroField(frame));
}

/** One binding-to-portrait reveal with no half-block or white ANSI swap. */
export function renderCinematicBraillePlate(plate: BraillePlate, frame: number, progress: number): string[] {
	return paintHero(plate, frame, cinematicHeroField(progress));
}

function starAt(x: number, y: number, frame: number): string {
	const hash = (x * 73856093) ^ (y * 19349663) ^ (frame * 83492791);
	const bucket = Math.abs(hash) % 113;
	if (bucket === 0) return rgbPaint(bloodRgb(0.48), isAscii() ? "*" : "✦");
	if (bucket === 1) return rgbPaint(bloodRgb(0.24), "·");
	return " ";
}

export function renderStarfield(width: number, height: number, frame: number): string[] {
	const lines: string[] = [];
	for (let y = 0; y < height; y++) {
		let line = "";
		for (let x = 0; x < width; x++) line += starAt(x, y, frame >> 3);
		lines.push(line);
	}
	return lines;
}

/** Keep light terminal defaults from bleaching the red portrait during startup. */
export function applyErosDarkTerminal(write: (s: string) => void = s => process.stdout.write(s)): void {
	write("\x1b]11;#060205\x07");
	write("\x1b]10;#ffb0c0\x07");
	write("\x1b]12;#ff5078\x07");
}

export function restoreTerminalColors(write: (s: string) => void = s => process.stdout.write(s)): void {
	write("\x1b]111\x07");
	write("\x1b]110\x07");
	write("\x1b]112\x07");
}

export function getStartupSplashDuration(): number {
	return SETUP_SPLASH_MS;
}

export function renderSetupSplash(width: number, height: number, elapsedMs: number): string[] {
	return renderErosSequence(DEFAULT_ASSETS, width, height, elapsedMs);
}

function redRail(left: string, fill: string, right: string, width: number): string {
	return rgbPaint(bloodRgb(0.5), left) + rgbPaint(bloodRgb(0.3), fill.repeat(width)) + rgbPaint(bloodRgb(0.5), right);
}

function renderErosSequence(assets: ErosAssets, width: number, height: number, elapsedMs: number): string[] {
	const w = Math.max(1, width);
	const h = Math.max(1, height);
	const frame = Math.max(0, Math.floor(elapsedMs / SETUP_TICK_MS));
	if (w < MIN_SCENE_WIDTH || h < MIN_SCENE_HEIGHT) return renderCompactSplash(w, h, assets.title);

	const plate = selectBraillePlate(assets.brailleVariants, w - 4, h - 4);
	if (!plate) return renderCompactSplash(w, h, assets.title);

	const artRows = renderCinematicBraillePlate(plate, frame, clamp01(elapsedMs / SETUP_SPLASH_MS));
	const outerLeft = Math.floor((w - plate.width - 2) / 2);
	const outerRight = w - outerLeft - plate.width - 2;
	const box = theme.boxRound;
	const rail = (left: string, fill: string, right: string): string =>
		padding(outerLeft) + redRail(left, fill, right, plate.width) + padding(outerRight);
	const rows = Array.from({ length: h }, () => padding(w));

	rows[0] = clampLine(centerLine(bold(rgbPaint(bloodRgb(0.9), assets.title)), w), w);
	rows[1] = clampLine(rail(box.topLeft, box.horizontal, box.topRight), w);
	for (let y = 0; y < plate.height; y++) {
		rows[2 + y] = clampLine(
			padding(outerLeft) +
				rgbPaint(bloodRgb(0.34), box.vertical) +
				(artRows[y] ?? padding(plate.width)) +
				rgbPaint(bloodRgb(0.34), box.vertical) +
				padding(outerRight),
			w,
		);
	}
	rows[2 + plate.height] = clampLine(rail(box.bottomLeft, box.horizontal, box.bottomRight), w);
	rows[h - 1] = clampLine(centerLine(themePaint("dim", SKIP_HINT), w), w);
	return rows;
}

export interface ErosRenderer {
	readonly durationMs: number;
	render(width: number, height: number, elapsedMs: number): string[];
}

/** Splash and screensaver share the same responsive portrait family and red reveal. */
export function createErosRenderer(): ErosRenderer {
	const assets = buildErosAssets(loadIntroPack());
	return {
		durationMs: SETUP_SPLASH_MS,
		render(width, height, elapsedMs) {
			return renderErosSequence(assets, width, height, elapsedMs);
		},
	};
}

function renderCompactSplash(width: number, height: number, title: string): string[] {
	const rows = Array.from({ length: height }, () => padding(width));
	rows[0] = clampLine(centerLine(bold(rgbPaint(bloodRgb(0.9), title)), width), width);
	if (height > 2) rows[height - 1] = clampLine(centerLine(themePaint("dim", SKIP_HINT), width), width);
	return rows;
}
