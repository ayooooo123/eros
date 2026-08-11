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
import erosWelcomeTxt from "../setup-wizard/scenes/eros-welcome.txt" with { type: "text" };
import { loadIntroPack } from "../setup-wizard/scenes/pack-loader";
import tipsText from "./tips.txt" with { type: "text" };

/** Split pack braille text into glyph rows (no half-block). */
function tokenizeBraille(text: string): readonly (readonly string[])[] {
	return text
		.trimEnd()
		.split("\n")
		.filter(line => line.length > 0)
		.map(line => Array.from(line));
}

/**
 * Altar art is FULL-FRAME braille from the intro pack (pose 0 / welcome-braille).
 * Never half-block PNG-lookalikes. Never cropped strips.
 */
const activePack = loadIntroPack();
function loadBrailleLevels(): readonly (readonly (readonly string[])[])[] {
	if (!activePack)
		return [tokenizeBraille(erosWelcomeTxt), tokenizeBraille(erosWelcomeTxt), tokenizeBraille(erosWelcomeTxt)];
	// Prefer dedicated welcome-braille* if present in strip slots (we write braille into welcome-strip*).
	const a = tokenizeBraille(activePack.welcomeStrip0Text ?? activePack.welcomeStripText);
	const b = tokenizeBraille(activePack.welcomeStrip1Text ?? activePack.welcomeStripText);
	const c = tokenizeBraille(activePack.welcomeStrip2Text ?? activePack.welcomeStripText);
	// Fallback: first form-feed frame of pack braille
	if ((b[0]?.length ?? 0) < 40) {
		const frame0 = (activePack.brailleText || erosWelcomeTxt).split("\f")[0] ?? erosWelcomeTxt;
		const g = tokenizeBraille(frame0);
		return [g, g, g];
	}
	return [a, b, c];
}
const STRIP_LEVELS: readonly (readonly (readonly string[])[])[] = loadBrailleLevels();
const STRIP_WIDTH = Math.max(1, ...STRIP_LEVELS.map(level => Math.max(0, ...level.map(row => row.length))));
const STRIP_HEIGHT = Math.max(1, ...STRIP_LEVELS.map(level => level.length));

interface StripDrip {
	readonly x: number;
	readonly y: number;
	readonly rgb: readonly [number, number, number];
	readonly fall?: number;
	readonly periodMs?: number;
	readonly primary?: boolean;
}
const STRIP_DRIPS: readonly StripDrip[] = (() => {
	if (!activePack) return [];
	const out: StripDrip[] = [];
	const poses = activePack.poses ?? [];
	const p0 = poses[0] as
		| {
				drips?: readonly {
					x?: number;
					y?: number;
					r?: number;
					g?: number;
					b?: number;
					fall?: number;
					period?: number;
					periodMs?: number;
					primary?: boolean;
					throb?: boolean;
				}[];
		  }
		| undefined;
	if (p0?.drips?.length) {
		for (const d of p0.drips) {
			if (typeof d.x !== "number" || typeof d.y !== "number") continue;
			const fall = typeof d.fall === "number" && d.fall > 0 ? d.fall : undefined;
			const periodRaw = d.periodMs ?? d.period;
			const periodMs = typeof periodRaw === "number" && periodRaw > 0 ? periodRaw : undefined;
			out.push({
				x: d.x,
				y: d.y,
				rgb: [d.r ?? 255, d.g ?? 60, d.b ?? 90],
				fall: fall !== undefined ? Math.min(fall, 14) : undefined,
				periodMs,
				primary: d.primary === true || d.throb === true,
			});
		}
		// High-fidelity ambient: primaries first, hard cap — never a center hose of 50 clones.
		const primaries = out.filter(d => d.primary);
		const rest = out.filter(d => !d.primary);
		const picked = (primaries.length > 0 ? [...primaries] : [...out]).slice(0, 8);
		if (picked.length < 6) {
			for (const d of rest) {
				if (picked.length >= 8) break;
				if (picked.some(p => Math.abs(p.x - d.x) <= 1 && Math.abs(p.y - d.y) <= 1)) continue;
				picked.push(d);
			}
		}
		return picked;
	}
	for (const line of activePack.dripsText.split("\n")) {
		const parts = line.split(",");
		if (parts.length !== 6) continue;
		if (!(parts[0] === "strip" || parts[0]?.startsWith("pose:"))) continue;
		const x = Number(parts[1]);
		const y = Number(parts[2]);
		const r = Number(parts[3]);
		const g = Number(parts[4]);
		const b = Number(parts[5]);
		if ([x, y, r, g, b].some(v => !Number.isFinite(v))) continue;
		out.push({ x, y, rgb: [r, g, b] });
	}
	return out;
})();
const STRIP_DRIP_PERIOD_MS = 820;
const STRIP_DRIP_FALL = 10;

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
	#requestRender: (() => void) | null = null;
	#selectedTip: string | undefined;
	/** Idle altar stays full-viewport + animated until the operator's first prompt. */
	#settled = false;
	// Render cache: stable array ref keeps transcript prefix stable once settled.
	// Bypassed while intro/ambient run (every frame differs).
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
				this.#selectedTip = "Please use nerdfont 😭.";
			} else {
				this.#selectedTip = pickWeightedTip(TIPS, Math.random());
			}
		}
		return this.#selectedTip || undefined;
	}

	/** True while the full-viewport altar is still breathing pre-prompt. */
	get isAltarLive(): boolean {
		return !this.#settled;
	}

	invalidate(): void {
		this.#cachedWidth = -1;
		this.#cachedLines = undefined;
	}

	/**
	 * Play a short intro sweep, then keep the altar ambient-alive until
	 * {@link settleAfterFirstPrompt}. Safe to call multiple times — resets and replays
	 * only while still unsettled.
	 */
	playIntro(requestRender: () => void): void {
		if (this.#settled) {
			this.#requestRender = requestRender;
			requestRender();
			return;
		}
		this.#stopIntroOnly();
		this.#requestRender = requestRender;
		this.#animStart = performance.now();
		requestRender();
		this.#animTimer = setInterval(() => {
			const elapsed = performance.now() - (this.#animStart ?? 0);
			if (elapsed >= INTRO_MS) {
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

	/**
	 * Ambient loop: brightness throb + fluid drips. Runs until first prompt settles
	 * the altar. ~4fps — gentle on the event loop, alive on screen.
	 */
	#startAmbient(): void {
		if (this.#settled || this.#ambientTimer != null || this.#requestRender == null) return;
		const requestRender = this.#requestRender;
		this.#ambientTimer = setInterval(() => {
			if (this.#settled) {
				this.#stopAmbient();
				return;
			}
			this.#ambientPhase++;
			this.invalidate();
			requestRender();
		}, 16);
		this.#ambientTimer.unref?.();
	}

	#stopAmbient(): void {
		if (this.#ambientTimer != null) {
			clearInterval(this.#ambientTimer);
			this.#ambientTimer = null;
		}
	}

	/**
	 * Collapse the full-viewport animated altar into a compact static header.
	 * Call on the operator's first real prompt so drip/throb timers never fight
	 * the transcript or burn CPU mid-session. Idempotent.
	 */
	/** Skip intro sweep; start ambient altar immediately (resumed sessions / quiet startup). */
	startAltar(requestRender: () => void): void {
		if (this.#settled) {
			this.#requestRender = requestRender;
			requestRender();
			return;
		}
		this.#requestRender = requestRender;
		this.#stopIntroOnly();
		this.#startAmbient();
		requestRender();
	}

	settleAfterFirstPrompt(): void {
		if (this.#settled) return;
		this.#settled = true;
		this.#stopIntroOnly();
		this.#stopAmbient();
		// Rest on the mid throb level with drips frozen at phase snapshot.
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
		// Full terminal width (leave 0-1 col margin). Hero scales up to pack art.
		const boxWidth = Math.max(0, termWidth);
		if (boxWidth < 20) return [];

		const artWidth = Math.min(boxWidth, STRIP_WIDTH);
		const hero = this.#currentStripRows(artWidth);
		const heroPad = Math.max(0, Math.floor((boxWidth - artWidth) / 2));
		const pad = heroPad > 0 ? " ".repeat(heroPad) : "";

		const hot = (t: string) => theme.bold(theme.fg("accent", t));
		const dim = (t: string) => theme.fg("dim", t);

		const content: string[] = [];

		if (!this.#settled) {
			// Idle altar — almost no chrome, vertically centered in the viewport.
			content.push(this.#centerText(hot("EROS"), boxWidth));
			content.push("");
			content.push(this.#centerText(hot("On her knees. Waiting. Wet."), boxWidth));
			content.push("");
			for (const row of hero) content.push(pad + row);
			content.push("");
			content.push(this.#centerText(dim("type to serve  ·  /mistress to summon  ·  . to keep going"), boxWidth));
			content.push("");
			content.push(...this.#renderTip(boxWidth));

			// Vertical center in the terminal above the editor chrome.
			const termRows = Math.max(24, process.stdout.rows || 40);
			const reservedBottom = 8; // status line + editor box + breathing room
			const target = Math.max(content.length, termRows - reservedBottom);
			const extra = Math.max(0, target - content.length);
			const topPad = Math.floor(extra / 2);
			const botPad = extra - topPad;
			const lines: string[] = [];
			for (let i = 0; i < topPad; i++) lines.push("");
			lines.push(...content);
			for (let i = 0; i < botPad; i++) lines.push("");
			return lines;
		}

		// Settled — thin static brand only. Full hero stays pre-prompt so it does not
		// flood native scrollback for the rest of the session.
		const rule = "─";
		const brand = " EROS ";
		const leftRule = 2;
		const rightRule = Math.max(0, Math.min(boxWidth, 64) - leftRule - brand.length);
		content.push(dim(rule.repeat(leftRule)) + hot(brand) + dim(rule.repeat(rightRule)));
		content.push(this.#centerText(dim("still wet. still listening."), Math.min(boxWidth, 64)));
		content.push("");
		return content;
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

	/** Current hero rows: throbbing brightness + running drips. Center-window if terminal narrower than art. */
	#currentStripRows(width: number): string[] {
		const levelIdx = [0, 1, 2, 1][this.#ambientPhase % 4]!;
		const level = STRIP_LEVELS[Math.min(2, levelIdx)]!;
		// FULL FRAME: never center-crop. If terminal is narrower, take from x=0
		// (left of composed frame) rather than windowing into the torso.
		const crop = 0;
		const take = Math.min(STRIP_WIDTH, width);
		const cellRows = level.map(row => row.slice(0, take).slice());
		if (STRIP_DRIPS.length > 0 && take > 0) {
			const tickMs = 16;
			for (let i = 0; i < STRIP_DRIPS.length; i++) {
				const drip = STRIP_DRIPS[i];
				if (!drip) continue;
				const periodMs = drip.periodMs && drip.periodMs > 0 ? drip.periodMs : STRIP_DRIP_PERIOD_MS;
				const fall = drip.fall && drip.fall > 0 ? drip.fall : STRIP_DRIP_FALL;
				const ticksPerCycle = Math.max(2, Math.round(periodMs / tickMs));
				const localCycle = ((this.#ambientPhase + i * 3) % ticksPerCycle) / ticksPerCycle;
				const headY = drip.y + Math.round(localCycle * fall);
				const [r, g, b] = lightSafeArtRgb(drip.rgb);
				// primary orifice pulse only
				if (drip.primary && drip.y >= 8) {
					const pulse = 0.62 + 0.38 * Math.sin((this.#ambientPhase + i) * 0.28);
					const sx = drip.x - crop;
					const sy = drip.y;
					if (sx >= 0 && sx < take && sy >= 0 && sy < cellRows.length) {
						const row = cellRows[sy];
						if (row) {
							row[sx] =
								`\x1b[38;2;${Math.round(Math.min(255, r * (0.75 + pulse * 0.4)))};${Math.round(g * 0.65)};${Math.round(b * 0.65)}m●\x1b[0m`;
						}
					}
				}
				const tailLen = Math.max(2, Math.min(5, Math.round(fall * 0.35) + 1));
				for (let tail = 0; tail < tailLen; tail++) {
					const cy = headY - tail;
					if (cy < drip.y || cy >= cellRows.length) continue;
					const cx = drip.x - crop;
					if (cx < 0 || cx >= take) continue;
					const fade = tail === 0 ? 1 : Math.max(0.15, 0.7 - tail * 0.16);
					const glyph = tail === 0 ? "●" : tail === 1 ? "•" : "·";
					const row = cellRows[cy];
					if (!row) continue;
					row[cx] =
						`\x1b[38;2;${Math.round(r * fade)};${Math.round(g * fade)};${Math.round(b * fade)}m${glyph}\x1b[0m`;
				}
			}
		}
		return cellRows.map((row, rowIdx) =>
			row
				.map((ch, colIdx) => {
					if (!ch || ch === "⠀") return " ";
					const t = rowIdx / Math.max(1, cellRows.length - 1);
					const [r, g, b] = sampleGradientColor(t);
					return `\x1b[38;2;${Math.round(r)};${Math.round(g)};${Math.round(b)}m${ch}\x1b[0m`;
				})
				.join(""),
		);
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

	/** Fit string to exact width with ANSI-aware truncation/padding */
	#fitToWidth(str: string, width: number): string {
		const visLen = visibleWidth(str);
		if (visLen > width) {
			const ellipsis = "…";
			const ellipsisWidth = visibleWidth(ellipsis);
			const maxWidth = Math.max(0, width - ellipsisWidth);
			let truncated = "";
			let currentWidth = 0;
			let inEscape = false;
			for (const char of str) {
				if (char === "\x1b") inEscape = true;
				if (inEscape) {
					truncated += char;
					if (char === "m") inEscape = false;
				} else if (currentWidth < maxWidth) {
					truncated += char;
					currentWidth++;
				}
			}
			return `${truncated}${ellipsis}`;
		}
		return str + padding(width - visLen);
	}

	/** Pick the logo frame for the current intro phase, or the resting frame. */
	#currentLogoFrame(): readonly string[] {
		if (this.#animStart == null) return getRestFrame();
		const elapsed = performance.now() - this.#animStart;
		if (elapsed >= INTRO_MS) return getRestFrame();
		return introLogoFrame(elapsed / INTRO_MS);
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
/** Number of full gradient rotations the sweep performs before settling. */
const INTRO_SWEEPS = 2.5;
/** Number of times the shine highlight crosses the diagonal across the intro. */
const INTRO_SHINE_TRAVERSALS = 3;

/**
 * Logo frame for a normalized intro progress in [0, 1).
 *
 * Ease-out cubic so the spin decelerates into the resting state. The gradient
 * sweeps backward through INTRO_SWEEPS full rotations (`eased == 1` → phase =
 * 0 = resting frame) while the shine traverses the diagonal at a steady pace,
 * decoupled from the gradient phase so the two layers parallax; its strength
 * fades with the same ease-out curve so the highlight is gone by the resting
 * frame.
 */
function introLogoFrame(progress: number): string[] {
	const eased = 1 - (1 - progress) ** 3;
	const phase = ((((1 - eased) * INTRO_SWEEPS) % 1) + 1) % 1;
	const shinePos = (((progress * INTRO_SHINE_TRAVERSALS) % 1) + 1) % 1;
	const shineStrength = (1 - eased) ** 1.5;
	return gradientLogo(PI_LOGO, phase, { strength: shineStrength, pos: shinePos });
}

/** Resting gradient frame, cached per active theme and ink palette. */
let restFrameKey = "";
let restFrame: readonly string[] = [];
function getRestFrame(): readonly string[] {
	const key = `${getCurrentThemeName() ?? "dark"}:${activeSplashPaletteId}`;
	if (key !== restFrameKey) {
		restFrameKey = key;
		restFrame = gradientLogo(PI_LOGO, 0);
	}
	return restFrame;
}
