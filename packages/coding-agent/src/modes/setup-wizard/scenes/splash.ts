import { padding, truncateToWidth, visibleWidth } from "@oh-my-pi/pi-tui";
import { gradientEscape, gradientLogo, PI_LOGO, setSplashPalette, type ShineConfig } from "../../components/welcome";
import { theme, type ThemeColor } from "../../theme/theme";
import erosBrailleFrames from "./eros-braille.txt" with { type: "text" };
import erosDrips from "./eros-drips.txt" with { type: "text" };
import erosHeroPunch0 from "./eros-hero-punch-0.txt" with { type: "text" };
import erosHeroPunch1 from "./eros-hero-punch-1.txt" with { type: "text" };
import erosHeroPunch2 from "./eros-hero-punch-2.txt" with { type: "text" };
import erosHeroWide0 from "./eros-hero-wide-0.txt" with { type: "text" };
import erosHeroWide1 from "./eros-hero-wide-1.txt" with { type: "text" };
import erosHeroWide2 from "./eros-hero-wide-2.txt" with { type: "text" };
import { type LoadedPack, loadIntroPack } from "./pack-loader";

function themePaint(key: string, ch: string, fallbackRgb = "180;140;150"): string {
	try {
		return theme.fg(key as ThemeColor, ch);
	} catch {
		return `\x1b[38;2;${fallbackRgb}m${ch}\x1b[0m`;
	}
}


/**
 * Proven terminal-art methods only:
 *   - Braille (2x4 dots) + ordered Bayer for stable animation (no FS crawl)
 *   - Truecolor half-block for the color hold (max terminal color fidelity)
 *   - Bayer-ordered bloom for the monochrome→color reveal (stable, no flicker)
 *   - Prebaked throb levels + drip anchors from the pack (no runtime guesswork)
 *
 * Beat sheet (pack can override ms):
 *   BRAILLE — she is already there, writhing across pose variants in blood ink
 *   BLOOM   — Bayer fire into truecolor + first squirt off every fluid anchor
 *   WIDE    — full-body hold, throbbing and running wet
 *   PUNCH   — camera sinks into her; second squirt; wordmark brands the floor
 */
const BRAILLE_MS = 16000;
const MORPH_MS = 4000;
const BLOOM_MS = 900;
const WIDE_MS = 2800;
const PUNCH_MS = 2200;
const BRAILLE_TOTAL_MS = BRAILLE_MS + MORPH_MS;
const BLOOM_START = BRAILLE_TOTAL_MS;
const WIDE_START = BLOOM_START + BLOOM_MS;
const PUNCH_START = WIDE_START + WIDE_MS;
export const SETUP_SPLASH_MS = PUNCH_START + PUNCH_MS;
export const SETUP_TICK_MS = 16;
/** Skip nothing — packs open on a full clear pose (emerge=0). */
const BRAILLE_PLAY_OFFSET = 0;
/** Gravity drips only — no upward squirt bursts. */

const RESET = "\x1b[0m";
/** Stage is ours: near-black red-brown behind every cell. */
const STAGE = "\x1b[48;2;6;2;5m";
const SKIP_HINT = "enter · take her";
const DEFAULT_WORDMARK = "L Y C O R P E R O S";
const DEFAULT_WORDMARK_SUB = "o n   h e r   k n e e s";

/** Brand mark at 2x for the compact fallback: glyphs doubled both ways. */
const LARGE_LOGO = PI_LOGO.flatMap(line => {
	let wide = "";
	for (const char of line) {
		wide += char === " " ? "  " : `${char}${char}`;
	}
	return [wide, wide];
});

/** One truecolor half-block cell: own fg+bg codes and reset, safe to slice/paint alone. */
const HERO_CELL = /(?:\x1b\[38;2;\d+;\d+;\d+m\x1b\[48;2;\d+;\d+;\d+m)▀(?:\x1b\[0m)?/g;
function tokenizeHero(text: string): readonly (readonly string[])[] {
	return text
		.trimEnd()
		.split("\n")
		.filter(line => line.length > 0)
		.map(line => (line.match(HERO_CELL) ?? []).map(cell => (cell.endsWith(RESET) ? cell : cell + RESET)));
}

/** A fluid source lifted from the art: where cum and blood actually run from. */
interface Drip {
	readonly x: number;
	readonly y: number;
	readonly rgb: readonly [number, number, number];
	/** cells the head falls per cycle; orifice-role specific when set */
	readonly fall?: number;
	/** ms per drip cycle; orifice-role specific when set */
	readonly periodMs?: number;
	/** anatomy role: pussy | asshole | cock | mouth | nipple */
	readonly role?: string;
	/** center stream of an orifice — only these pulse at the source */
	readonly primary?: boolean;
	/** visual weight: heavy | pour | veil | bead */
	readonly weight?: string;
}

interface PoseHold {
	readonly frame: number;
	readonly holdMs: number;
	readonly drips: readonly Drip[];
	readonly throbPeriodMs: number;
	readonly throbAmp: number;
	readonly dripPeriodMs: number;
	readonly dripFall: number;
	readonly squirtEveryMs: number;
	readonly squirtLenMs: number;
	readonly breathPeriodMs: number;
}

/** Everything a sequence render needs, resolved from one pack (or the embedded default). */
interface ErosAssets {
	readonly brailleFrames: readonly (readonly string[])[];
	readonly heroWide: readonly (readonly (readonly string[])[])[];
	readonly heroPunch: readonly (readonly (readonly string[])[])[];
	readonly dripsWide: readonly Drip[];
	readonly dripsPunch: readonly Drip[];
	readonly artWidth: number;
	readonly artHeight: number;
	readonly throbPeriodMs: number;
	readonly dripPeriodMs: number;
	readonly dripFallCells: number;
	readonly wordmark: string;
	readonly subtitle: string;
	readonly brailleTotalMs: number;
	readonly bloomMs: number;
	readonly wideMs: number;
	readonly punchMs: number;
	readonly totalMs: number;
	readonly colorFirst: boolean;
	readonly poses: readonly PoseHold[];
	readonly morphMsBetween: number;
}

function numParam(params: Record<string, unknown> | undefined, key: string, fallback: number): number {
	const v = params?.[key];
	return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

function beatMs(params: Record<string, unknown> | undefined, key: string, fallback: number): number {
	const beats = params?.beats;
	if (beats && typeof beats === "object" && beats !== null) {
		const v = (beats as Record<string, unknown>)[key];
		if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
	}
	return fallback;
}

function parseDripText(text: string, tag: string): readonly Drip[] {
	const out: Drip[] = [];
	for (const line of text.split("\n")) {
		const parts = line.split(",");
		if (parts.length !== 6 || parts[0] !== tag) continue;
		const [, x, y, r, g, b] = parts.map((value, index) => (index === 0 ? 0 : Number(value)));
		if ([x, y, r, g, b].some(value => !Number.isFinite(value))) continue;
		out.push({ x: x as number, y: y as number, rgb: [r as number, g as number, b as number] });
	}
	return out;
}

function buildErosAssets(pack: LoadedPack | null): ErosAssets {
	const brailleFrames = (pack?.brailleText || erosBrailleFrames)
		.split("\f")
		.map(frame => frame.split("\n").filter(line => line.length > 0))
		.filter(frame => frame.length > 0);
	const heroWide: readonly (readonly (readonly string[])[])[] = pack
		? [
				tokenizeHero(pack.heroWide0Text || pack.heroWideText),
				tokenizeHero(pack.heroWide1Text || pack.heroWideText),
				tokenizeHero(pack.heroWide2Text || pack.heroWideText),
			]
		: [tokenizeHero(erosHeroWide0), tokenizeHero(erosHeroWide1), tokenizeHero(erosHeroWide2)];
	const heroPunch: readonly (readonly (readonly string[])[])[] = pack
		? [
				tokenizeHero(pack.heroPunch0Text || pack.heroPunchText),
				tokenizeHero(pack.heroPunch1Text || pack.heroPunchText),
				tokenizeHero(pack.heroPunch2Text || pack.heroPunchText),
			]
		: [tokenizeHero(erosHeroPunch0), tokenizeHero(erosHeroPunch1), tokenizeHero(erosHeroPunch2)];
	const dripSource = pack ? pack.dripsText : erosDrips;
	const dripsWide = parseDripText(dripSource, "wide");
	const dripsPunch = parseDripText(dripSource, "punch");
	const earlyParams = pack?.params;
	const brailleW = Math.max(1, ...brailleFrames.map(frame => Math.max(1, ...frame.map(line => line.length))));
	const brailleH = Math.max(1, brailleFrames[0]?.length ?? 0);
	const wantColorFirst = earlyParams?.mode === "color-first" || earlyParams?.colorFirst === true;
	// Braille-first: art size is the FULL braille frame only. Do not inflate from
	// half-block heroes — that made viewports 200-wide and center-cropped 120 braille.
	const artWidth = wantColorFirst
		? Math.max(brailleW, ...heroWide[1]!.map(row => row.length))
		: brailleW;
	const artHeight = wantColorFirst ? Math.max(brailleH, heroWide[1]!.length) : brailleH;
	const params = pack?.params;
	const brailleMs = beatMs(params, "braille_ms", BRAILLE_MS);
	const morphMs = beatMs(params, "morph_ms", MORPH_MS);
	const bloomMs = beatMs(params, "bloom_ms", BLOOM_MS);
	const wideMs = beatMs(params, "wide_ms", WIDE_MS);
	const punchMs = beatMs(params, "punch_ms", PUNCH_MS);
	const poseHolds: PoseHold[] = [];
	const rawPoses = pack?.poses;
	if (Array.isArray(rawPoses)) {
		for (const rp of rawPoses) {
			if (!rp || typeof rp !== "object") continue;
			const o = rp as Record<string, unknown>;
			const frame = typeof o.frame === "number" ? o.frame : -1;
			const holdMs = typeof o.holdMs === "number" ? o.holdMs : 5000;
			if (frame < 0) continue;
			const dripsRaw = Array.isArray(o.drips) ? o.drips : [];
			const drips: Drip[] = [];
			for (const d of dripsRaw) {
				if (!d || typeof d !== "object") continue;
				const dd = d as Record<string, unknown>;
				const x = Number(dd.x);
				const y = Number(dd.y);
				// Accept rgb:[r,g,b] (pack craft) or flat r/g/b (legacy drips.txt)
				let r = Number(dd.r);
				let g = Number(dd.g);
				let b = Number(dd.b);
				if (Array.isArray(dd.rgb) && dd.rgb.length >= 3) {
					r = Number(dd.rgb[0]);
					g = Number(dd.rgb[1]);
					b = Number(dd.rgb[2]);
				}
				if (![x, y, r, g, b].every(Number.isFinite)) continue;
				const fall = Number(dd.fall);
				const period = Number(dd.period ?? dd.periodMs);
				const role = typeof dd.role === "string" ? dd.role : undefined;
				const primary = dd.primary === true || dd.throb === true;
				const weight = typeof dd.weight === "string" ? dd.weight : undefined;
				drips.push({
					x,
					y,
					rgb: [r, g, b],
					fall: Number.isFinite(fall) && fall > 0 ? fall : undefined,
					periodMs: Number.isFinite(period) && period > 0 ? period : undefined,
					role,
					primary,
					weight,
				});
			}
			// Sparse ambient: primaries first, max 8 — never center hose.
			{
				const primaries = drips.filter(d => d.primary);
				const rest = drips.filter(d => !d.primary);
				const picked = (primaries.length ? primaries : drips).slice(0, 8);
				for (const d of rest) {
					if (picked.length >= 8) break;
					if (picked.some(p => Math.abs(p.x - d.x) <= 1 && Math.abs(p.y - d.y) <= 1)) continue;
					picked.push(d);
				}
				drips.length = 0;
				for (const d of picked) {
					drips.push({
						...d,
						fall: d.fall !== undefined ? Math.min(d.fall, 14) : d.fall,
					});
				}
			}
			// Ambient: top-level pose fields OR nested ambient{}
			const amb = (o.ambient && typeof o.ambient === "object" ? o.ambient : {}) as Record<string, unknown>;
			const num = (k: string, fb: number) => {
				if (typeof o[k] === "number") return o[k] as number;
				if (typeof amb[k] === "number") return amb[k] as number;
				return fb;
			};
			poseHolds.push({
				frame,
				holdMs,
				drips,
				throbPeriodMs: num("throbPeriodMs", 560),
				throbAmp: num("throbAmp", 0.28),
				dripPeriodMs: num("dripPeriodMs", 600),
				dripFall: Math.min(12, num("dripFall", 10) || 10),
				squirtEveryMs: 0,
				squirtLenMs: 0,
				breathPeriodMs: num("breathPeriodMs", 2000),
			});
		}
	}
	// If pack declares pose holds, braille duration = sum(holds) + morphs between
	const morphMsBetween = typeof params?.morphSec === "number" ? Math.round((params.morphSec as number) * 1000) : 800;
	let brailleTotalMs = brailleMs + morphMs;
	if (poseHolds.length > 0) {
		const holdSum = poseHolds.reduce((a, p) => a + p.holdMs, 0);
		const morphSum = Math.max(0, poseHolds.length - 1) * morphMsBetween;
		brailleTotalMs = holdSum + morphSum;
	}
	const totalMs = brailleTotalMs + bloomMs + wideMs + punchMs;
	return {
		brailleFrames,
		heroWide,
		heroPunch,
		dripsWide,
		dripsPunch,
		artWidth,
		artHeight,
		throbPeriodMs: numParam(params, "throbPeriod", 760),
		dripPeriodMs: numParam(params, "dripPeriod", 1050),
		dripFallCells: numParam(params, "dripFall", 10),
		wordmark: typeof params?.wordmark === "string" ? String(params.wordmark) : DEFAULT_WORDMARK,
		subtitle: typeof params?.subtitle === "string" ? String(params.subtitle) : DEFAULT_WORDMARK_SUB,
		brailleTotalMs,
		bloomMs,
		wideMs,
		punchMs,
		totalMs,
		colorFirst: params?.mode === "color-first" || params?.colorFirst === true,
		poses: poseHolds,
		morphMsBetween,
	};
}

const DEFAULT_PACK = loadIntroPack();
setSplashPalette(DEFAULT_PACK?.palette);
const DEFAULT_ASSETS = buildErosAssets(DEFAULT_PACK);

/** Bayer 4x4 (0..15) — proven stable reveal order for the color bloom. */
const BAYER4 = [
	[0, 8, 2, 10],
	[12, 4, 14, 6],
	[3, 11, 1, 9],
	[15, 7, 13, 5],
];

const MIN_SCENE_WIDTH = 48;
const MIN_SCENE_HEIGHT = 18;

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

function starAt(x: number, y: number, frame: number): string {
	const hash = (x * 73856093) ^ (y * 19349663) ^ (frame * 83492791);
	const bucket = Math.abs(hash) % 97;
	if (bucket === 0) return theme.fg("accent", "✦");
	if (bucket === 1) return theme.fg("muted", "·");
	return " ";
}

export function renderStarfield(width: number, height: number, frame: number): string[] {
	const lines: string[] = [];
	for (let y = 0; y < height; y++) {
		let line = "";
		for (let x = 0; x < width; x++) {
			line += starAt(x, y, frame >> 3);
		}
		lines.push(line);
	}
	return lines;
}

/** Sparse embers around the art — heat, not Christmas lights. */
function skyGlyph(x: number, y: number, frame: number): string | null {
	const hash = (x * 73856093) ^ (y * 19349663) ^ (frame * 83492791);
	const bucket = Math.abs(hash) % 140;
	if (bucket > 2) return null;
	const paint = (key: string, ch: string, fallback: string): string => {
		try {
			return theme.fg(key as ThemeColor, ch);
		} catch {
			return fallback + ch + "\x1b[0m";
		}
	};
	if (bucket === 0) return paint("accent", "✦", "\x1b[38;2;255;80;120m");
	if (bucket === 1) return paint("border", "✧", "\x1b[38;2;120;60;80m");
	return paint("border", "·", "\x1b[38;2;90;50;70m");
}

/** Continuous diagonal gradient position (bottom-left → top-right). */
function screenGradientT(x: number, y: number, width: number, height: number, phase: number): number {
	const span = Math.max(1, width + height - 1);
	const base = (x + (height - 1 - y)) / span;
	const wrapped = (((base + phase) % 1) + 1) % 1;
	// Keep body ink hot and readable on black — ride the top of the blood palette.
	return 0.72 + wrapped * 0.28;
}


/** Brightness ping-pong into the throb variants: a slow, wet heartbeat. */
function throbIndex(elapsedMs: number, periodMs: number): number {
	return Math.round(1 + Math.sin((elapsedMs * Math.PI * 2) / periodMs));
}

/** Gravity pours. Primary orifice pulse. Weight picks glyph bulk. */
function paintDrips(
	put: (x: number, y: number, glyph: string) => void,
	drips: readonly Drip[],
	elapsedMs: number,
	dripPeriodMs: number,
	dripFallCells: number,
	srcX: number,
	srcY: number,
	dstX: number,
	dstY: number,
	viewW: number,
	viewH: number,
	artHeight: number,
): void {
	for (let i = 0; i < drips.length; i++) {
		const drip = drips[i];
		if (!drip) continue;
		const period = drip.periodMs && drip.periodMs > 0 ? drip.periodMs : dripPeriodMs;
		const fall = drip.fall && drip.fall > 0 ? drip.fall : dripFallCells;
		const weight = drip.weight ?? "pour";
		const cycle = ((elapsedMs + i * 97) % period) / period;
		const head = drip.y + cycle * fall;
		const [r, g, b] = drip.rgb;

		// Primary orifice throb — hot and present
		if (drip.primary && drip.y >= 6) {
			const pulse = 0.55 + 0.45 * Math.sin((elapsedMs * Math.PI * 2) / Math.max(320, period * 0.9) + i * 0.35);
			const ox = drip.x - srcX;
			const oy = drip.y - srcY;
			if (oy >= 0 && oy < viewH && ox >= 0 && ox < viewW) {
				const pr = Math.round(Math.min(255, r * (0.72 + pulse * 0.5)));
				const pg = Math.round(Math.min(255, g * (0.5 + pulse * 0.28)));
				const pb = Math.round(Math.min(255, b * (0.5 + pulse * 0.28)));
				const core = weight === "bead" ? "•" : weight === "curtain" || weight === "heavy" ? "●" : "●";
				put(dstX + ox, dstY + oy, `\x1b[38;2;${pr};${pg};${pb}m${core}${RESET}`);
				// single under-dot for heavy blood mouths / flood
				if ((weight === "heavy" || weight === "curtain") && oy + 1 < viewH) {
					put(
						dstX + ox,
						dstY + oy + 1,
						`\x1b[38;2;${Math.round(pr * 0.55)};${Math.round(pg * 0.4)};${Math.round(pb * 0.4)}m░${RESET}`,
					);
				}
			}
		}

		// Tail bulk by weight
		let tailLen: number;
		if (weight === "bead") tailLen = Math.max(2, Math.min(5, Math.round(fall * 0.4) + 1));
		else if (weight === "veil") tailLen = Math.max(3, Math.min(8, Math.round(fall * 0.45) + 2));
		else if (weight === "heavy" || weight === "curtain" || weight === "flood" || weight === "rope")
			tailLen = Math.max(5, Math.min(14, Math.round(fall * 0.7) + 3));
		else tailLen = Math.max(4, Math.min(10, Math.round(fall * 0.55) + 2));

		for (let tail = 0; tail < tailLen; tail++) {
			const cellY = Math.round(head) - tail;
			if (cellY < drip.y || cellY >= artHeight) continue;
			const row = cellY - srcY;
			const col = drip.x - srcX;
			if (row < 0 || row >= viewH || col < 0 || col >= viewW) continue;
			const t = tail / Math.max(1, tailLen - 1);
			const fade = tail === 0 ? 1 : Math.max(0.08, 0.82 - t * 0.75);
			let glyph: string;
			if (weight === "bead") {
				glyph = tail === 0 ? "•" : tail === 1 ? "·" : "˙";
			} else if (weight === "veil") {
				glyph = tail === 0 ? "▄" : tail < 3 ? "▖" : "·";
			} else if (weight === "rope") {
				glyph = tail === 0 ? "█" : tail === 1 ? "▓" : tail < 4 ? "▄" : "·";
			} else {
				// heavy / curtain / flood / pour
				glyph = tail === 0 ? "█" : tail === 1 ? "▓" : tail === 2 ? "▄" : tail < 6 ? "▖" : "·";
			}
			put(
				dstX + col,
				dstY + row,
				`\x1b[38;2;${Math.round(r * fade)};${Math.round(g * fade)};${Math.round(b * fade)}m${glyph}${RESET}`,
			);
		}
	}
}


/** Force terminal default bg/fg dark for the splash (OSC 11/10). Ghostty light themes
 *  otherwise paint empty cells white and kill braille contrast. */
export function applyErosDarkTerminal(write: (s: string) => void = s => process.stdout.write(s)): void {
	// OSC 11 = background, OSC 10 = foreground, OSC 12 = cursor
	write("\x1b]11;#060205\x07");
	write("\x1b]10;#ffb0c0\x07");
	write("\x1b]12;#ff5078\x07");
}

/** Restore default colors (OSC 11/10/12 reset to terminal defaults). */
export function restoreTerminalColors(write: (s: string) => void = s => process.stdout.write(s)): void {
	write("\x1b]111\x07");
	write("\x1b]110\x07");
	write("\x1b]112\x07");
}

export function getStartupSplashDuration(): number {
	return DEFAULT_ASSETS.totalMs || SETUP_SPLASH_MS;
}

export function renderSetupSplash(width: number, height: number, elapsedMs: number): string[] {
	return renderErosSequence(DEFAULT_ASSETS, width, height, elapsedMs);
}

export function renderErosSequence(assets: ErosAssets, width: number, height: number, elapsedMs: number): string[] {
	const w = Math.max(1, width);
	const h = Math.max(1, height);
	// Color-first packs: NEVER show braille. Timeline is wide-hold then punch,
	// both fully bloomed truecolor from the first paint.
	let tMs = elapsedMs;
	if (assets.colorFirst) {
		const bloomDone = assets.brailleTotalMs + assets.bloomMs; // fully revealed
		const colorDur = Math.max(1, assets.wideMs + assets.punchMs);
		const u = Math.max(0, Math.min(1, elapsedMs / Math.max(1, assets.totalMs)));
		tMs = bloomDone + u * colorDur;
	}
	const totalMs = assets.totalMs || SETUP_SPLASH_MS;
	const progress = Math.max(0, Math.min(1, elapsedMs / totalMs));
	const phase = progress * 1.8;
	const shine: ShineConfig = { pos: (progress * 2.8) % 1, strength: Math.max(0.35, 1 - progress * 0.18) };

	if (w < MIN_SCENE_WIDTH || h < MIN_SCENE_HEIGHT) return renderCompactSplash(w, h, phase, shine, assets);

	const frame = Math.floor(elapsedMs / SETUP_TICK_MS);
	// Every cell owns the dark stage bg — never leave bare spaces for a light
	// terminal theme to shine through (Ghostty Flexoki Light was washing braille).
	const EMPTY = STAGE + " " + RESET;
	const cells: string[][] = Array.from({ length: h }, () => new Array<string>(w).fill(EMPTY));
	const put = (x: number, y: number, glyph: string): void => {
		if (y >= 0 && y < h && x >= 0 && x < w) {
			// Strip trailing reset then wrap with STAGE so bg always wins
			const body = glyph.endsWith(RESET) ? glyph.slice(0, -RESET.length) : glyph;
			cells[y][x] = STAGE + body + RESET;
		}
	};

	const { brailleFrames, heroWide, heroPunch, dripsWide, dripsPunch, artWidth, artHeight } = assets;
	const bloomStart = assets.brailleTotalMs;
	const punchStart = bloomStart + assets.bloomMs + assets.wideMs;
	// FULL FRAME only — never center-crop the composed braille art.
	// Paint the entire artWidth×artHeight; center in the terminal. If the
	// terminal is smaller than the art, edges clip (terminal limit) rather than
	// silently windowing into the torso.
	const viewW = artWidth;
	const viewH = artHeight;
	const srcX = 0;
	const srcY = 0;
	const dstX = Math.max(0, Math.floor((w - viewW) / 2));
	const dstY = Math.max(0, Math.floor((h - viewH - 1) / 2));

	// Embers behind everything — constant, sparse heat.
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const star = skyGlyph(x, y, frame >> 3);
			if (star) put(x, y, star);
		}
	}

	if (tMs < bloomStart) {
		// Pose holds + morph crossfade. Gravity drips only.
		const poses = assets.poses;
		let artIndex = 0;
		let active: PoseHold | null = poses[0] ?? null;
		let prevPose: PoseHold | null = null;
		let nextPose: PoseHold | null = null;
		let holdLocalMs = tMs;
		let inMorph = false;
		let morphT = 0;

		if (poses.length > 0) {
			let cursor = 0;
			for (let i = 0; i < poses.length; i++) {
				const pose = poses[i]!;
				const holdEnd = cursor + pose.holdMs;
				if (tMs < holdEnd) {
					active = pose;
					prevPose = pose;
					nextPose = null;
					artIndex = pose.frame;
					holdLocalMs = tMs - cursor;
					inMorph = false;
					break;
				}
				cursor = holdEnd;
				if (i + 1 < poses.length) {
					const morphEnd = cursor + assets.morphMsBetween;
					if (tMs < morphEnd) {
						const a = pose.frame;
						const b = poses[i + 1]!.frame;
						morphT = (tMs - cursor) / Math.max(1, assets.morphMsBetween);
						artIndex = Math.min(b, a + Math.max(1, Math.floor(morphT * Math.max(1, b - a))));
						prevPose = pose;
						nextPose = poses[i + 1]!;
						// active used for throb/ambient — blend toward next after midpoint
						active = morphT < 0.5 ? pose : poses[i + 1]!;
						holdLocalMs = morphT < 0.5 ? pose.holdMs * (1 - morphT) : morphT * 200;
						inMorph = true;
						break;
					}
					cursor = morphEnd;
				}
				if (i === poses.length - 1) {
					active = pose;
					prevPose = pose;
					artIndex = pose.frame;
					holdLocalMs = pose.holdMs;
				}
			}
		} else {
			const n = brailleFrames.length;
			const u = Math.min(0.999, tMs / Math.max(1, assets.brailleTotalMs));
			artIndex = Math.min(n - 1, Math.floor(u * n));
		}

		const art = brailleFrames[Math.min(brailleFrames.length - 1, Math.max(0, artIndex))] ?? [];
		const throbPeriod = active?.throbPeriodMs ?? assets.throbPeriodMs;
		const throbAmp = active?.throbAmp ?? 0.28;
		const breathPeriod = active?.breathPeriodMs ?? 2000;
		const throb = 1 - throbAmp + throbAmp * (0.5 + 0.5 * Math.sin((holdLocalMs * Math.PI * 2) / throbPeriod));
		const breath = 0.5 + 0.5 * Math.sin((holdLocalMs * Math.PI * 2) / breathPeriod);
		const pulse2 = 0.5 + 0.5 * Math.sin((holdLocalMs * Math.PI * 2) / Math.max(320, throbPeriod * 0.55));
		const brailleShine: ShineConfig = {
			pos: (0.1 + breath * 0.8 + (inMorph ? morphT * 0.25 : 0) + pulse2 * 0.05) % 1,
			strength: Math.min(1, 0.55 + throb * 0.5 + pulse2 * 0.15 + (inMorph ? 0.12 : 0)),
		};
		for (let row = 0; row < viewH; row++) {
			const line = art[srcY + row];
			if (line === undefined) continue;
			for (let col = 0; col < viewW; col++) {
				const glyph = line[srcX + col];
				if (glyph === undefined || glyph === "⠀") continue;
				const t = screenGradientT(dstX + col, dstY + row, w, h, phase);
				const localShine: ShineConfig = {
					pos: brailleShine.pos,
					strength: Math.min(1, brailleShine.strength * throb),
				};
				put(dstX + col, dstY + row, gradientEscape(t, localShine) + glyph + RESET);
			}
		}

		// Gravity drips: during morph paint BOTH pose streams so the pour never dies.
		const dripPeriod = active?.dripPeriodMs ?? assets.dripPeriodMs;
		const dripFall = active?.dripFall ?? assets.dripFallCells;
		if (inMorph && prevPose && nextPose) {
			// outgoing pour stays until ~70%; incoming fades in from 30%
			if (morphT < 0.72 && prevPose.drips.length) {
				paintDrips(
					put,
					prevPose.drips,
					prevPose.holdMs + morphT * 400,
					prevPose.dripPeriodMs || dripPeriod,
					prevPose.dripFall || dripFall,
					srcX,
					srcY,
					dstX,
					dstY,
					viewW,
					viewH,
					artHeight,
				);
			}
			if (morphT > 0.28 && nextPose.drips.length) {
				paintDrips(
					put,
					nextPose.drips,
					morphT * 800,
					nextPose.dripPeriodMs || dripPeriod,
					nextPose.dripFall || dripFall,
					srcX,
					srcY,
					dstX,
					dstY,
					viewW,
					viewH,
					artHeight,
				);
			}
		} else {
			const poseDrips = active?.drips?.length ? active.drips : dripsWide;
			paintDrips(
				put,
				poseDrips,
				holdLocalMs + (active ? 0 : tMs),
				dripPeriod,
				dripFall,
				srcX,
				srcY,
				dstX,
				dstY,
				viewW,
				viewH,
				artHeight,
			);
		}
		// Gravity drips only — no upward squirt/explode bursts.
	} else {
		// Braille-first: stay on the last braille pose. Full frame only.
		const art = brailleFrames[brailleFrames.length - 1] ?? [];
		const holdLocalMs = tMs - bloomStart;
		const throb = 1 - 0.18 + 0.18 * (0.5 + 0.5 * Math.sin((holdLocalMs * Math.PI * 2) / assets.throbPeriodMs));
		const brailleShine: ShineConfig = {
			pos: (holdLocalMs / 2800) % 1,
			strength: Math.min(1, 0.5 + throb * 0.35),
		};
		for (let row = 0; row < viewH; row++) {
			const line = art[srcY + row];
			if (line === undefined) continue;
			for (let col = 0; col < viewW; col++) {
				const glyph = line[srcX + col];
				if (glyph === undefined || glyph === "⠀") continue;
				const t = screenGradientT(dstX + col, dstY + row, w, h, phase);
				const localShine: ShineConfig = {
					pos: brailleShine.pos,
					strength: Math.min(1, brailleShine.strength * throb),
				};
				put(dstX + col, dstY + row, gradientEscape(t, localShine) + glyph + RESET);
			}
		}
		paintDrips(
			put,
			dripsWide,
			tMs,
			assets.dripPeriodMs,
			assets.dripFallCells,
			srcX,
			srcY,
			dstX,
			dstY,
			viewW,
			viewH,
			artHeight,
		);
	}


	// Wordmark brands the floor under the art as the color lands, and stays.
	const markStart = bloomStart + assets.bloomMs * 0.35;
	if (tMs > markStart) {
		const reveal = Math.min(1, (tMs - markStart) / 520);
		const markRow = Math.min(h - 2, dstY + viewH);
		const wordmark = assets.wordmark;
		const subtitle = assets.subtitle;
		const shown = Math.max(1, Math.round(wordmark.length * reveal));
		const text = wordmark.slice(0, shown);
		let col = Math.floor((w - wordmark.length) / 2);
		for (const ch of text) {
			if (ch !== " ") {
				const t = screenGradientT(col, markRow, w, h, phase);
				put(col, markRow, gradientEscape(t, shine) + ch + RESET);
			}
			col++;
		}
		if (reveal >= 1 && markRow + 1 < h - 1) {
			let subCol = Math.floor((w - subtitle.length) / 2);
			for (const ch of subtitle) {
				if (ch !== " ") put(subCol, markRow + 1, themePaint("muted", ch, "200;160;170"));
				subCol++;
			}
		}
	}

	// Skip hint on a cleared strip at the bottom.
	const hintWidth = visibleWidth(SKIP_HINT);
	const hintStart = Math.floor((w - hintWidth) / 2);
	const hintRow = h - 1;
	for (let x = hintStart - 1; x <= hintStart + hintWidth; x++) put(x, hintRow, " ");
	let hintCol = hintStart;
	for (const ch of SKIP_HINT) put(hintCol++, hintRow, ch === " " ? " " : themePaint("dim", ch, "120;90;100"));

	return cells.map(row => row.join(""));
}

/** A fresh sequence renderer bound to a freshly loaded (random) pack. */
export interface ErosRenderer {
	readonly durationMs: number;
	render(width: number, height: number, elapsedMs: number): string[];
}

export function createErosRenderer(): ErosRenderer {
	const pack = loadIntroPack();
	setSplashPalette(pack?.palette);
	const assets = buildErosAssets(pack);
	return {
		durationMs: assets.totalMs,
		render(width, height, elapsedMs) {
			return renderErosSequence(assets, width, height, elapsedMs);
		},
	};
}

/** Centered fallback for windows too small to hold the art. */
function renderCompactSplash(
	width: number,
	height: number,
	phase: number,
	shine: ShineConfig,
	assets: ErosAssets,
): string[] {
	const art = height >= 14 ? LARGE_LOGO : PI_LOGO;
	const content = [...gradientLogo(art, phase, shine), "", themePaint("accent", assets.wordmark, "255;80;120")];
	const start = Math.max(0, Math.floor((height - content.length) / 2));
	const lines: string[] = [];
	for (let y = 0; y < height; y++) {
		const item = content[y - start];
		lines.push(clampLine(item !== undefined ? centerLine(item, width) : "", width));
	}
	if (height > 2) lines[height - 2] = clampLine(centerLine(themePaint("dim", SKIP_HINT, "120;90;100"), width), width);
	return lines;
}
