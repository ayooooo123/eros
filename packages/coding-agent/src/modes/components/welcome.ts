import {
	type Component,
	padding,
	replaceTabs,
	TERMINAL,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@oh-my-pi/pi-tui";
import { getCurrentThemeName, isLightTheme, theme } from "../../modes/theme/theme";
import { loadIntroPack } from "../setup-wizard/scenes/pack-loader";
import {
	EROS_TITLE,
	getErosBraillePlates,
	renderAnimatedBraillePlate,
	renderCinematicBraillePlate,
	SETUP_TICK_MS,
	selectBraillePlate,
} from "../setup-wizard/scenes/splash";
import tipsText from "./tips.txt" with { type: "text" };

const activePack = loadIntroPack();
const WELCOME_BRAILLE_PLATES = getErosBraillePlates(activePack);
/** Rows left open beneath the responsive altar for status and the composer. */
export const WELCOME_EDITOR_RESERVATION_ROWS = 8;
const ALTAR_AMBIENT_TICK_MS = 80;

/** Tips embedded at build time, one per line; blanks dropped. */
const TIPS: readonly string[] = tipsText
	.split("\n")
	.map(line => line.trim())
	.filter(line => line.length > 0);

/**
 * Fixed number of session rows in the welcome box so its height stays stable
 * across recent-session updates.
 */
export const WELCOME_SESSION_SLOTS = 8;

/**
 * Fixed number of LSP-server rows, for the same reason. Overflow is sliced so
 * the box height is constant regardless of how many servers a project has.
 */
export const WELCOME_LSP_SLOTS = 4;

/** Trailing marker that flags a tip as a "what's new" callout. Stripped before
 *  wrapping (with any preceding whitespace) and replaced by {@link NEW_TAG_TEXT}
 *  painted as a shimmering rainbow. Non-global so `.test` stays stateless. */
const NEW_TIP_MARKER = /\s*\[NEW\]\s*$/;

/** Visible text rendered in place of {@link NEW_TIP_MARKER}. */
const NEW_TAG_TEXT = "NEW!";

/** Milliseconds for one full hue rotation of the rainbow "NEW!" tag. */
const NEW_GLOW_PERIOD_MS = 1500;

/** Selection weight for "[NEW]" tips; ordinary tips weigh 1, so a freshly added
 *  affordance surfaces this many times as often. */
const NEW_TIP_WEIGHT = 4;

/** Pick a tip from `tips`, biased toward "[NEW]" tips by {@link NEW_TIP_WEIGHT};
 *  `r` is a uniform sample in [0, 1). Returns "" when `tips` is empty.
 *  Exported for tests. */
export function pickWeightedTip(tips: readonly string[], r: number): string {
	if (tips.length === 0) return "";
	const weights = tips.map(tip => (NEW_TIP_MARKER.test(tip) ? NEW_TIP_WEIGHT : 1));
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	let acc = r * total;
	for (let i = 0; i < tips.length; i++) {
		acc -= weights[i] ?? 1;
		if (acc < 0) return tips[i] ?? "";
	}
	return tips[tips.length - 1] ?? "";
}

type ColorEncoding = "ansi-16m" | "ansi-256";

/** Paint each glyph of {@link NEW_TAG_TEXT} on a moving HSL rainbow. `phase`
 *  rotates the hue offset cyclically; successive renders with increasing phase
 *  shimmer, while a fixed phase yields a still rainbow. */
function renderNewTag(phase: number, encoding: ColorEncoding): string {
	const bold = "\x1b[1m";
	const reset = "\x1b[0m";
	const wrapped = ((phase % 1) + 1) % 1;
	const chars = [...NEW_TAG_TEXT];
	let out = bold;
	let prev = "";
	for (let i = 0; i < chars.length; i++) {
		const hue = Math.round(((i / chars.length + wrapped) % 1) * 360);
		const color = Bun.color(`hsl(${hue}, 95%, 60%)`, encoding) ?? "";
		if (color !== prev) {
			out += color;
			prev = color;
		}
		out += chars[i];
	}
	return out + reset;
}
export function renderWelcomeTip(tip: string, boxWidth: number, phase = 0): string[] {
	const fullLabel = "Mistress whispers: ";
	const compactLabel = "Mistress: ";
	const label = boxWidth - 1 - visibleWidth(fullLabel) >= 8 ? fullLabel : compactLabel;
	const labelWidth = visibleWidth(label);
	const bodyBudget = boxWidth - 1 - labelWidth; // 1 = leading indent
	if (bodyBudget < 8) return [];

	const isNew = NEW_TIP_MARKER.test(tip);
	const body = isNew ? tip.replace(NEW_TIP_MARKER, "") : tip;

	const wrappedBody = wrapTextWithAnsi(replaceTabs(body), bodyBudget);
	if (wrappedBody.length === 0) return [];

	// Pull both colors from the active theme so the line stays readable on light
	// themes; the previous hardcoded `#b48cff` / `#9ccfff` pastels (plus a manual
	// `\x1b[2m` dim on the body) dropped to ~1.5:1 contrast on a white background.
	const continuationIndent = padding(labelWidth);
	const styledLabel = theme.fg("customMessageLabel", label);

	const lines = wrappedBody.map((line, index) => {
		const styledBody = theme.fg("muted", line);
		const content = index === 0 ? `${styledLabel}${styledBody}` : `${continuationIndent}${styledBody}`;
		return ` ${theme.italic(content)}`;
	});

	if (isNew) {
		// Append the rainbow tag to the final body line when it fits within the
		// box; otherwise drop it onto its own indented continuation line so the
		// styled glyphs never overflow or reflow the wrapped body.
		const encoding: ColorEncoding = TERMINAL.trueColor ? "ansi-16m" : "ansi-256";
		const tag = renderNewTag(phase, encoding);
		const tagWidth = 1 + visibleWidth(NEW_TAG_TEXT); // 1 = space separator
		const lastLine = lines[lines.length - 1];
		if (lastLine !== undefined && visibleWidth(lastLine) + tagWidth <= boxWidth) {
			lines[lines.length - 1] = `${lastLine} ${tag}`;
		} else {
			lines.push(` ${continuationIndent}${tag}`);
		}
	}

	return lines;
}

export interface RecentSession {
	name: string;
	timeAgo: string;
}

export interface LspServerInfo {
	name: string;
	status: "ready" | "error" | "connecting" | "available";
	fileTypes: string[];
}

/**
 * Art-first EROS welcome: full-width hi-res ANSI hero, minimal horny chrome.
 */
export class WelcomeComponent implements Component {
	#animStart: number | null = null;
	#animTimer: Timer | null = null;
	#ambientTimer: Timer | null = null;
	#ambientPhase = 0;
	#ambientStart: number | null = null;
	#frozenFrame = 0;
	#requestRender: (() => void) | null = null;
	#selectedTip: string | undefined;
	/** The full altar moves until the first prompt, then freezes intact in scrollback. */
	#settled = false;
	// A frozen full altar keeps a stable array reference as transcript history grows.
	// The cache is bypassed only while intro or ambient motion is active.
	#cachedWidth = -1;
	#cachedLines: string[] | undefined;

	constructor(
		private readonly version: string,
		private modelName: string,
		private providerName: string,
		private recentSessions: RecentSession[] = [],
		private lspServers: LspServerInfo[] = [],
	) {}
	get tip(): string | undefined {
		if (this.#selectedTip === undefined) {
			if (theme.getSymbolPreset() === "unicode" && Math.random() < 0.1) {
				this.#selectedTip = "Nerd Font gives her ornaments sharper teeth.";
			} else {
				this.#selectedTip = pickWeightedTip(TIPS, Math.random());
			}
		}
		return this.#selectedTip || undefined;
	}

	/** True only while the persistent altar is still moving before the first prompt. */
	get isAltarLive(): boolean {
		return !this.#settled;
	}

	invalidate(): void {
		this.#cachedWidth = -1;
		this.#cachedLines = undefined;
	}

	/**
	 * Play a short intro sweep, then keep the same full altar ambient-alive until
	 * {@link settleAfterFirstPrompt} freezes it as durable transcript history.
	 * Safe to call multiple times while still unsettled.
	 */
	playIntro(requestRender: () => void): void {
		if (this.#settled) {
			this.#requestRender = requestRender;
			requestRender();
			return;
		}
		this.#stopIntroOnly();
		this.#stopAmbient();
		this.#ambientPhase = 0;
		this.#animStart = performance.now();
		requestRender();
		this.#animTimer = setInterval(() => {
			const elapsed = performance.now() - (this.#animStart ?? 0);
			if (elapsed >= INTRO_MS) {
				this.#ambientPhase = Math.max(this.#ambientPhase, Math.floor(elapsed / SETUP_TICK_MS));
				this.#stopIntroOnly();
				this.#startAmbient();
			}
			requestRender();
		}, INTRO_TICK_MS);
	}

	/** Stop intro timer only (does not kill ambient). */
	#stopIntroOnly(): void {
		if (this.#animTimer != null) {
			clearInterval(this.#animTimer);
			this.#animTimer = null;
		}
		this.#animStart = null;
		this.invalidate();
	}

	#currentFrame(): number {
		if (this.#settled) return this.#frozenFrame;
		if (this.#animStart !== null) {
			return Math.max(0, Math.floor((performance.now() - this.#animStart) / SETUP_TICK_MS));
		}
		if (this.#ambientStart !== null) {
			return this.#ambientPhase + Math.max(0, Math.floor((performance.now() - this.#ambientStart) / SETUP_TICK_MS));
		}
		return this.#ambientPhase;
	}

	/**
	 * Ambient loop: brightness throb + fluid drips. The first submitted prompt
	 * freezes the complete altar so timers never fight transcript scrollback or
	 * burn CPU mid-session.
	 */
	#startAmbient(): void {
		if (this.#settled || this.#ambientTimer != null || this.#requestRender == null) return;
		const requestRender = this.#requestRender;
		this.#ambientStart = performance.now();
		this.#ambientTimer = setInterval(() => {
			if (this.#settled) {
				this.#stopAmbient();
				return;
			}
			this.invalidate();
			requestRender();
		}, ALTAR_AMBIENT_TICK_MS);
		this.#ambientTimer.unref?.();
	}

	#stopAmbient(): void {
		if (this.#ambientStart !== null) {
			this.#ambientPhase = this.#currentFrame();
			this.#ambientStart = null;
		}
		if (this.#ambientTimer != null) {
			clearInterval(this.#ambientTimer);
			this.#ambientTimer = null;
		}
	}

	/** Freeze motion after the first submitted prompt while retaining the complete altar. */
	/** Skip intro sweep; start ambient altar immediately (resumed sessions / quiet startup). */
	startAltar(requestRender: () => void): void {
		if (this.#settled) {
			this.#requestRender = requestRender;
			requestRender();
			return;
		}
		this.#requestRender = requestRender;
		const frame = this.#currentFrame();
		this.#stopIntroOnly();
		this.#ambientPhase = Math.max(this.#ambientPhase, frame);
		this.#startAmbient();
		requestRender();
	}

	settleAfterFirstPrompt(): void {
		if (this.#settled) return;
		this.#frozenFrame = this.#currentFrame();
		this.#settled = true;
		this.#stopIntroOnly();
		this.#stopAmbient();
		this.invalidate();
		this.#requestRender?.();
	}

	setModel(modelName: string, providerName: string): void {
		this.modelName = modelName;
		this.providerName = providerName;
		this.invalidate();
	}

	setRecentSessions(sessions: RecentSession[]): void {
		this.recentSessions = sessions;
		this.invalidate();
	}

	setLspServers(servers: LspServerInfo[]): void {
		this.lspServers = servers;
		this.invalidate();
	}

	render(termWidth: number): readonly string[] {
		const live = !this.#settled && (this.#animStart != null || this.#ambientTimer != null);
		if (!live && this.#cachedLines && this.#cachedWidth === termWidth) {
			return this.#cachedLines;
		}
		const lines = this.#renderLines(termWidth);
		if (live) {
			this.#cachedLines = undefined;
			this.#cachedWidth = -1;
		} else {
			this.#cachedLines = lines;
			this.#cachedWidth = termWidth;
		}
		return lines;
	}

	#renderLines(termWidth: number): string[] {
		const boxWidth = Math.max(0, termWidth);
		if (boxWidth < 20) return [];

		const hot = (text: string): string => theme.bold(theme.fg("accent", text));
		const teal = (text: string): string => theme.bold(theme.fg("mdLink", text));
		const dim = (text: string): string => theme.fg("dim", text);
		const identity = `v${this.version} · ${this.providerName}/${this.modelName}`;

		const reportedRows = process.stdout.rows;
		const terminalRows = typeof reportedRows === "number" && reportedRows > 0 ? reportedRows : 40;
		const availableRows = Math.max(1, terminalRows - WELCOME_EDITOR_RESERVATION_ROWS);
		const tipLines = this.#renderTip(boxWidth);
		const readyLsps = this.lspServers.filter(server => server.status === "ready").length;
		const memory = [
			this.recentSessions.length > 0
				? `${this.recentSessions.length} old thread${this.recentSessions.length === 1 ? "" : "s"}`
				: "",
			readyLsps > 0 ? `${readyLsps} language ${readyLsps === 1 ? "mouth" : "mouths"} awake` : "",
		]
			.filter(Boolean)
			.join(" · ");
		const chromeRows = 9 + (memory ? 1 : 0) + tipLines.length;
		const plate = selectBraillePlate(WELCOME_BRAILLE_PLATES, boxWidth - 2, Math.max(0, availableRows - chromeRows));
		if (!plate) {
			const compact = [
				this.#centerText(hot(EROS_TITLE), boxWidth),
				this.#centerText(teal("On her knees. Waiting. Wet."), boxWidth),
				this.#centerText(dim("her altar wants a larger hole"), boxWidth),
				...tipLines,
			].slice(0, availableRows);
			return compact.map(line => this.#fitToWidth(line, boxWidth));
		}

		const elapsed = this.#animStart === null ? null : Math.max(0, performance.now() - this.#animStart);
		const frame = this.#currentFrame();
		const artRows =
			elapsed === null
				? renderAnimatedBraillePlate(plate, frame)
				: renderCinematicBraillePlate(plate, frame, Math.min(1, elapsed / INTRO_MS));
		const box = theme.boxRound;
		const rail = this.#centerText(
			theme.fg("borderAccent", box.topLeft) +
				theme.fg("border", box.horizontal.repeat(plate.width)) +
				theme.fg("borderAccent", box.topRight),
			boxWidth,
		);
		const lowerRail = this.#centerText(
			theme.fg("borderAccent", box.bottomLeft) +
				theme.fg("border", box.horizontal.repeat(plate.width)) +
				theme.fg("borderAccent", box.bottomRight),
			boxWidth,
		);
		const content = [
			this.#centerText(hot(EROS_TITLE), boxWidth),
			this.#centerText(teal("On her knees. Waiting. Wet."), boxWidth),
			this.#centerText(dim(identity), boxWidth),
			...(memory ? [this.#centerText(dim(memory), boxWidth)] : []),
			rail,
			...artRows.map(row =>
				this.#centerText(theme.fg("border", box.vertical) + row + theme.fg("border", box.vertical), boxWidth),
			),
			lowerRail,
			this.#centerText(dim("type to use her  ·  /mistress for the lash  ·  . to keep her moving"), boxWidth),
			...tipLines,
		].map(line => this.#fitToWidth(line, boxWidth));
		const extraRows = Math.max(0, availableRows - content.length);
		const topPad = Math.floor(extraRows / 2);
		const lines = Array.from({ length: topPad }, () => padding(boxWidth));
		lines.push(...content);
		for (let row = lines.length; row < availableRows; row++) lines.push(padding(boxWidth));
		return lines;
	}

	#renderTip(boxWidth: number): string[] {
		const tip = this.tip;
		if (!tip) return [];
		// A trailing "[NEW]" marker paints an animated rainbow "NEW!" tag. Derive
		// its hue phase from wall-clock time so it shimmers across the welcome
		// intro's re-render frames, then settles into a still rainbow once the box
		// caches its resting frame. Non-"[NEW]" tips ignore the phase entirely.
		const phase = NEW_TIP_MARKER.test(tip) ? performance.now() / NEW_GLOW_PERIOD_MS : 0;
		return renderWelcomeTip(tip, boxWidth, phase);
	}

	#fitToWidth(text: string, width: number): string {
		const truncated = truncateToWidth(text, width);
		return truncated + padding(Math.max(0, width - visibleWidth(truncated)));
	}

	/** Center text within a given width */
	#centerText(text: string, width: number): string {
		const visLen = visibleWidth(text);
		if (visLen >= width) {
			return truncateToWidth(text, width);
		}
		const leftPad = Math.floor((width - visLen) / 2);
		const rightPad = width - visLen - leftPad;
		return padding(leftPad) + text + padding(rightPad);
	}
}

export const PI_LOGO = [
	"▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄",
	"█▓▒░  LYCORPEROS   ░▒▓█",
	"█▓▒░   e r o s     ░▒▓█",
	"█▓▒░ on her knees  ░▒▓█",
	"▀▀▀▀▀▀▀▀▀▀▀▄▄▀▀▀▀▀▀▀▀▀▀▀",
	"           ▀▀",
];

/** Blood palettes tuned independently for dark and light terminal backgrounds. */
type SplashRgb = readonly [number, number, number];
const DARK_BLOOD_STOPS: ReadonlyArray<SplashRgb> = [
	[255, 40, 70],
	[255, 70, 100],
	[255, 110, 140],
	[255, 160, 180],
	[255, 220, 230],
];
const LIGHT_BLOOD_STOPS: ReadonlyArray<SplashRgb> = [
	[84, 6, 22],
	[111, 8, 30],
	[138, 12, 39],
	[164, 20, 50],
	[188, 32, 63],
];

/** Pack-selectable ink palettes (ids match the Lab's ink picker). */
export const SPLASH_PALETTES: Record<string, ReadonlyArray<SplashRgb>> = {
	white: [
		[143, 135, 128],
		[201, 194, 186],
		[232, 226, 218],
		[246, 241, 234],
		[255, 255, 255],
	],
	blood: DARK_BLOOD_STOPS,
	neon: [
		[10, 143, 160],
		[0, 216, 200],
		[77, 255, 233],
		[168, 255, 243],
		[224, 255, 250],
	],
	gold: [
		[160, 106, 16],
		[224, 169, 46],
		[255, 207, 94],
		[255, 233, 168],
		[255, 246, 221],
	],
	emerald: [
		[15, 122, 70],
		[31, 196, 110],
		[77, 255, 160],
		[169, 255, 207],
		[226, 255, 238],
	],
	ultraviolet: [
		[106, 43, 160],
		[154, 77, 224],
		[185, 117, 255],
		[211, 168, 255],
		[238, 220, 255],
	],
};

let activeSplashPaletteId = "blood";

function splashUsesLightTheme(): boolean {
	return isLightTheme(getCurrentThemeName());
}

/** Cap bright pack colors so artwork remains visible on a light terminal. */
function lightSafeArtRgb(rgb: SplashRgb): SplashRgb {
	if (!splashUsesLightTheme()) return rgb;
	const max = Math.max(...rgb);
	if (max <= 145) return rgb;
	const scale = 145 / max;
	return [Math.round(rgb[0] * scale), Math.round(rgb[1] * scale), Math.round(rgb[2] * scale)];
}

function getActiveGradientStops(): ReadonlyArray<SplashRgb> {
	if (activeSplashPaletteId === "blood" && splashUsesLightTheme()) return LIGHT_BLOOD_STOPS;
	const stops = SPLASH_PALETTES[activeSplashPaletteId] ?? DARK_BLOOD_STOPS;
	return splashUsesLightTheme() ? stops.map(lightSafeArtRgb) : stops;
}

function sampleGradientColor(t: number): SplashRgb {
	const stops = getActiveGradientStops();
	const seg = Math.max(0, Math.min(1, t)) * (stops.length - 1);
	const i = Math.min(stops.length - 2, Math.floor(seg));
	const f = seg - i;
	const a = stops[i]!;
	const b = stops[i + 1]!;
	return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Override the splash gradient palette (Lab pack ink choice). Unknown ids are ignored. */
export function setSplashPalette(id: string | undefined): void {
	if (id && SPLASH_PALETTES[id]) activeSplashPaletteId = id;
}

/** 256-color ramps for terminals without truecolor. */
const DARK_GRADIENT_RAMP_256 = [52, 88, 160, 197, 211, 217, 223];
const LIGHT_GRADIENT_RAMP_256 = [52, 88, 124, 160];

/** Half-width of the shine highlight band, expressed in gradient-t units. */
const SHINE_HALF_WIDTH = 0.18;

export interface ShineConfig {
	/** Overall opacity of the shine overlay, in [0, 1]. */
	strength: number;
	/** Center of the shine band along the diagonal, in [0, 1]. */
	pos: number;
}

/**
 * Resolve the gradient SGR foreground escape for a normalized position `t`
 * (0..1) along the diagonal, compositing the optional sliding shine highlight.
 * Shared by {@link gradientLogo} and the setup splash so both stay
 * color-identical (truecolor when available, 256-color ramp otherwise).
 */
export function gradientEscape(t: number, shine?: ShineConfig): string {
	const shineStrength = shine && shine.strength > 0 ? shine.strength : 0;
	const shinePos = shine ? shine.pos : 0;
	if (TERMINAL.trueColor) {
		// 5-stop palette widens the visible color range and avoids the
		// deep-blue valley a naive HSL lerp falls into.
		let [r, g, bl] = sampleGradientColor(t);
		if (shineStrength > 0) {
			const dist = Math.abs(t - shinePos);
			const intensity = Math.max(0, 1 - dist / SHINE_HALF_WIDTH) * shineStrength;
			if (intensity > 0) {
				const shineTarget: SplashRgb = splashUsesLightTheme() ? [55, 0, 18] : [255, 255, 255];
				r += (shineTarget[0] - r) * intensity;
				g += (shineTarget[1] - g) * intensity;
				bl += (shineTarget[2] - bl) * intensity;
			}
		}
		return `\x1b[38;2;${Math.round(r)};${Math.round(g)};${Math.round(bl)}m`;
	}
	const ramp = splashUsesLightTheme() ? LIGHT_GRADIENT_RAMP_256 : DARK_GRADIENT_RAMP_256;
	let idx = Math.min(ramp.length - 1, Math.max(0, Math.floor(t * (ramp.length - 1) + 0.5)));
	if (shineStrength > 0) {
		const dist = Math.abs(t - shinePos);
		const intensity = Math.max(0, 1 - dist / SHINE_HALF_WIDTH) * shineStrength;
		// Promote to the brightest ramp slot when the shine band peaks here.
		if (intensity > 0.5) idx = ramp.length - 1;
	}
	return `\x1b[38;5;${ramp[idx]}m`;
}

/**
 * Apply a multi-stop diagonal gradient (bottom-left → top-right) plus an
 * optional sliding shine band across multi-line art. `phase` (0..1) shifts the
 * gradient along the diagonal, wrapping at 1. When `shine` is provided, a soft
 * white highlight is composited on top, centered at `shine.pos`.
 */
export function gradientLogo(lines: readonly string[], phase = 0, shine?: ShineConfig): string[] {
	const reset = "\x1b[0m";
	const rows = lines.length;
	const cols = Math.max(...lines.map(l => l.length));
	// span+1 so `base` stays strictly < 1: avoids the wrap-around at the
	// far corner mapping back to t=0 (hot pink) on the resting frame.
	const span = Math.max(1, cols + rows - 1);
	return lines.map((line, y) => {
		let result = "";
		for (let x = 0; x < line.length; x++) {
			const char = line[x];
			if (char === " ") {
				result += char;
				continue;
			}
			// Diagonal: bottom-left (x=0, y=rows-1) → top-right (x=cols-1, y=0)
			const base = (x + (rows - 1 - y)) / span;
			const t = (((base + phase) % 1) + 1) % 1;
			result += gradientEscape(t, shine) + char + reset;
		}
		return result;
	});
}

/** Total length of the intro animation. */
const INTRO_MS = 3000;
/** Render cadence during the intro (~30fps). */
const INTRO_TICK_MS = 33;
