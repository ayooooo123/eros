import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import "./wall.css";

/**
 * The art wall — the surface the whole product is built on.
 *
 * A committed deep-mark render is sampled onto the character grid the text UI
 * uses and painted as real terminal glyphs, so the image is not *behind* the
 * terminal — it *is* the terminal: same cell advance, same line height, same
 * twelve colours out of `lycorperos.json`.
 *
 * Fidelity comes from sub-cell glyphs. The wall probes the live font once and
 * picks the densest set it can actually draw:
 *
 * - **braille** (U+2800…28FF) → 2x4 sub-samples per cell, near-square samples;
 * - **quadrants** (▘▝▖▗▀▄▌▐▚▞▛▜▙▟█) → 2x2, the fallback when braille is missing.
 *
 * Tone mapping is a sigmoidal contrast curve (not a gamma crush) plus a red
 * boost, so flesh keeps its colour and lands on blood/rose/blush instead of
 * washing to ash, and Floyd–Steinberg error diffusion carries the detail the
 * ten-entry ramp cannot hold on its own.
 *
 * On top of the still field runs a fluid layer that never stops: beads swell out
 * of the brightest cells and let go, drips fall and leave a wet trail, pools
 * collect along the floor, one flush per streamed token, a tear on state
 * changes, an ember where something landed — and every `rotateMs` the plate
 * changes behind a **drip-wipe**: the next frame runs down over the last one
 * behind a ragged blood front.
 */
export interface ErosWallProps {
	/** Bundled plate URLs to rotate through — see `./plates`. */
	plates: readonly string[];
	/** Index of the first plate. */
	start?: number;
	/** Canvas opacity. */
	burn?: number;
	/** Highest ramp index the wall may use. 9 = silk allowed. */
	ink?: number;
	/** 0..1 — heat: faster throb, heavier beading, drips biased to the centre. */
	heat?: number;
	/** Change the value to tear the wall (state change). */
	tear?: number;
	/** Change the value to bloom an ember (something arrived). */
	ember?: number;
	/** Change the value to flush the wall (one token). */
	pulse?: number;
	/** Change the value to drip-wipe to the next plate now (session event). */
	advance?: number;
	/** Idle rotation period. 0 disables the timer. */
	rotateMs?: number;
	/** Extra class on the host element. */
	className?: string;
}

/** Ramp keys resolved from tokens.css — void → silk, coldest to hottest. */
const RAMP_VARS = [
	"--void",
	"--status-bg",
	"--tool-pending-bg",
	"--tool-error-bg",
	"--blood-deep",
	"--blood",
	"--hot-blood",
	"--rose",
	"--blush",
	"--silk",
] as const;

/** Quadrant glyphs indexed by tl|tr<<1|bl<<2|br<<3. */
const QUADS = [" ", "▘", "▝", "▀", "▖", "▌", "▞", "▛", "▗", "▚", "▐", "▜", "▄", "▙", "▟", "█"] as const;
/** Braille dot bit per (subCol, subRow) in a 2x4 cell. */
const DOTS = [
	[0x01, 0x02, 0x04, 0x40],
	[0x08, 0x10, 0x20, 0x80],
] as const;

const TEAR_MS = 300;
const EMBER_MS = 950;
const FLUSH_MS = 220;
const WIPE_MS = 1500;
/** Sigmoidal contrast, matching the curve the plates were curated through. */
const CONTRAST = 4.4;
const PIVOT = 0.5;

interface Bead {
	col: number;
	row: number;
	swell: number;
	rate: number;
}

interface Drip {
	col: number;
	row: number;
	vel: number;
	life: number;
}

interface Runtime {
	heat: number;
	ink: number;
	tearUntil: number;
	emberUntil: number;
	flushUntil: number;
	emberX: number;
	emberY: number;
	wipe: number;
}

/** Does this font actually draw the glyph, or is it tofu / blank? */
function inks(ch: string, font: string): boolean {
	const c = document.createElement("canvas");
	c.width = 24;
	c.height = 24;
	const g = c.getContext("2d", { willReadFrequently: true });
	if (!g) return false;
	g.fillStyle = "#000";
	g.fillRect(0, 0, 24, 24);
	g.fillStyle = "#fff";
	g.font = font;
	g.textBaseline = "middle";
	g.fillText(ch, 2, 12);
	const d = g.getImageData(0, 0, 24, 24).data;
	let lit = 0;
	for (let i = 0; i < d.length; i += 4) if ((d[i] as number) > 40) lit++;
	// tofu boxes ink a lot; a blank inks nothing. Braille dots land in between.
	return lit > 6 && lit < 200;
}

export function ErosWall({
	plates,
	start = 0,
	burn = 1,
	ink = 9,
	heat = 0,
	tear = 0,
	ember = 0,
	pulse = 0,
	advance = 0,
	rotateMs = 26_000,
	className,
}: ErosWallProps): ReactNode {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const runtime = useRef<Runtime>({
		heat,
		ink,
		tearUntil: 0,
		emberUntil: 0,
		flushUntil: 0,
		emberX: 0.5,
		emberY: 0.5,
		wipe: 0,
	});

	runtime.current.heat = heat;
	runtime.current.ink = ink;

	useEffect(() => {
		if (tear > 0) runtime.current.tearUntil = performance.now() + TEAR_MS;
	}, [tear]);

	useEffect(() => {
		if (pulse > 0) runtime.current.flushUntil = performance.now() + FLUSH_MS;
	}, [pulse]);

	useEffect(() => {
		if (ember > 0) {
			const r = runtime.current;
			r.emberUntil = performance.now() + EMBER_MS;
			r.emberX = 0.2 + Math.random() * 0.6;
			r.emberY = 0.25 + Math.random() * 0.55;
		}
	}, [ember]);

	// `advance` is read by the paint effect through this counter.
	const advanceRef = useRef(advance);
	advanceRef.current = advance;

	useEffect(() => {
		const host = hostRef.current;
		const canvas = canvasRef.current;
		if (!host || !canvas || plates.length === 0) return;
		const ctx = canvas.getContext("2d", { alpha: false });
		const fieldA = document.createElement("canvas");
		const fieldB = document.createElement("canvas");
		const actx = fieldA.getContext("2d", { alpha: false });
		const bctx = fieldB.getContext("2d", { alpha: false });
		const probe = document.createElement("canvas");
		const pctx = probe.getContext("2d", { alpha: false, willReadFrequently: true });
		if (!ctx || !actx || !bctx || !pctx) return;

		const rootStyle = getComputedStyle(document.documentElement);
		const ramp = RAMP_VARS.map(v => rootStyle.getPropertyValue(v).trim() || "#000");
		const levels = ramp.length - 1;
		const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		let cols = 0;
		let rows = 0;
		let cellW = 8;
		let cellH = 18;
		let dpr = 1;
		let font = "13px monospace";
		/** 4 with braille, 2 with quadrants. */
		let subY = 2;
		let braille = false;
		let front: HTMLCanvasElement = fieldA;
		let frontCtx = actx;
		let back: HTMLCanvasElement = fieldB;
		let backCtx = bctx;
		let plateIdx = ((start % plates.length) + plates.length) % plates.length;
		let bright = new Uint8Array(0);
		let wet = new Float32Array(0);
		let pool = new Float32Array(0);
		let wipeFront = new Float32Array(0);
		let wipeSpeed = new Float32Array(0);
		let wipeUntil = 0;
		let beads: Bead[] = [];
		let drips: Drip[] = [];
		let raf = 0;
		let relayout = 0;
		let rotator = 0;
		let seenAdvance = advanceRef.current;
		let disposed = false;
		const loaded = new Map<number, HTMLImageElement>();

		const measureCell = (): void => {
			const cs = getComputedStyle(host);
			const fs = Number.parseFloat(cs.getPropertyValue("--cell-fs")) || 13;
			cellH = Number.parseFloat(cs.getPropertyValue("--cell-lh")) || 18;
			font = `${fs}px ${cs.getPropertyValue("--font-mono").trim() || "monospace"}`;
			frontCtx.font = font;
			cellW = frontCtx.measureText("0").width || fs * 0.6;
			braille = inks("⣿", font);
			subY = braille ? 4 : 2;
		};

		const load = (i: number): HTMLImageElement | null => {
			const cached = loaded.get(i);
			if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
			const img = new Image();
			img.decoding = "async";
			img.src = plates[i] as string;
			loaded.set(i, img);
			// keep at most three decoded plates alive
			if (loaded.size > 3) {
				for (const key of loaded.keys()) {
					if (key !== i) {
						loaded.delete(key);
						break;
					}
				}
			}
			img.addEventListener("load", () => {
				if (!disposed) requestAnimationFrame(() => draw(performance.now()));
			});
			return null;
		};

		/** Rasterize one plate into a field canvas as sub-cell glyph art. */
		const rasterize = (target: CanvasRenderingContext2D, img: HTMLImageElement): void => {
			const w = host.clientWidth;
			const h = host.clientHeight;
			const gw = cols * 2;
			const gh = rows * subY;
			probe.width = gw;
			probe.height = gh;

			// The plates are tall portraits and the viewport is wide. Covering would
			// crop each frame down to an unreadable band, so instead every plate is
			// shown at FULL HEIGHT and tiled across the width, mirrored on alternate
			// tiles — the whole composition stays legible and the wall fills the room.
			pctx.fillStyle = ramp[0] as string;
			pctx.fillRect(0, 0, gw, gh);
			pctx.imageSmoothingQuality = "high";
			// tile width in grid units, from the plate aspect measured in *pixels*
			// One sample is w/gw px wide and h/gh px tall, so a full-height plate is
			// gw * (h / w) * plateAspect samples wide.
			const tileW = Math.max(16, Math.round(gw * (h / w) * (img.width / img.height)));
			const tiles = Math.ceil(gw / tileW) + 1;
			// Repeat, never mirror: mirroring turns an already-symmetric frame into
			// wallpaper and costs the viewer the subject.
			for (let t = 0; t < tiles; t++) {
				pctx.drawImage(img, 0, 0, img.width, img.height, t * tileW, 0, tileW, gh);
			}
			const px = pctx.getImageData(0, 0, gw, gh).data;

			const top = Math.max(2, Math.min(levels, runtime.current.ink));
			// tone map: sigmoidal contrast + red lift, then Floyd–Steinberg to the ramp
			const lum = new Float32Array(gw * gh);
			const s0 = 1 / (1 + Math.exp(CONTRAST * PIVOT));
			const s1 = 1 / (1 + Math.exp(-CONTRAST * (1 - PIVOT)));
			const heatLift = runtime.current.heat * 0.1;
			for (let i = 0, o = 0; i < lum.length; i++, o += 4) {
				const red = px[o] as number;
				const green = px[o + 1] as number;
				const blue = px[o + 2] as number;
				let l = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
				// saturated red rides higher than its luminance earns: flesh stays flesh
				l = Math.min(1, l + 0.02 + Math.max(0, (red - Math.max(green, blue)) / 255) * 0.34 + heatLift);
				const sig = 1 / (1 + Math.exp(-CONTRAST * (l - PIVOT)));
				lum[i] = Math.max(0, Math.min(1, (sig - s0) / (s1 - s0)));
			}
			const idx = new Uint8Array(gw * gh);
			for (let y = 0; y < gh; y++) {
				for (let x = 0; x < gw; x++) {
					const i = y * gw + x;
					const v = lum[i] as number;
					const q = Math.max(0, Math.min(top, Math.round(v * top)));
					idx[i] = q;
					const err = v - q / top;
					if (x + 1 < gw) lum[i + 1] = (lum[i + 1] as number) + err * 0.4375;
					if (y + 1 < gh) {
						if (x > 0) lum[i + gw - 1] = (lum[i + gw - 1] as number) + err * 0.1875;
						lum[i + gw] = (lum[i + gw] as number) + err * 0.3125;
						if (x + 1 < gw) lum[i + gw + 1] = (lum[i + gw + 1] as number) + err * 0.0625;
					}
				}
			}

			target.setTransform(dpr, 0, 0, dpr, 0, 0);
			target.fillStyle = ramp[0] as string;
			target.fillRect(0, 0, w, h);
			target.font = font;
			target.textBaseline = "alphabetic";
			bright = new Uint8Array(cols * rows);
			const baseline = cellH * 0.8;
			for (let row = 0; row < rows; row++) {
				const yTop = row * cellH;
				for (let col = 0; col < cols; col++) {
					// gather the cell's sub-samples
					let lo = 99;
					let hi = -1;
					for (let sy = 0; sy < subY; sy++) {
						const base = (row * subY + sy) * gw + col * 2;
						const a = idx[base] as number;
						const b = idx[base + 1] as number;
						if (a < lo) lo = a;
						if (a > hi) hi = a;
						if (b < lo) lo = b;
						if (b > hi) hi = b;
					}
					bright[row * cols + col] = hi;
					if (lo === hi) {
						target.fillStyle = ramp[lo] as string;
						target.fillRect(col * cellW, yTop, cellW + 0.6, cellH + 0.6);
						continue;
					}
					const cut = (lo + hi) / 2;
					target.fillStyle = ramp[lo] as string;
					target.fillRect(col * cellW, yTop, cellW + 0.6, cellH + 0.6);
					let bits = 0;
					if (braille) {
						for (let sy = 0; sy < subY; sy++) {
							const base = (row * subY + sy) * gw + col * 2;
							if ((idx[base] as number) > cut) bits |= DOTS[0]?.[sy] ?? 0;
							if ((idx[base + 1] as number) > cut) bits |= DOTS[1]?.[sy] ?? 0;
						}
						target.fillStyle = ramp[hi] as string;
						target.fillText(String.fromCharCode(0x2800 + bits), col * cellW, yTop + baseline);
					} else {
						const t = idx[row * 2 * gw + col * 2] as number;
						const tr = idx[row * 2 * gw + col * 2 + 1] as number;
						const bl = idx[(row * 2 + 1) * gw + col * 2] as number;
						const br = idx[(row * 2 + 1) * gw + col * 2 + 1] as number;
						bits = (t > cut ? 1 : 0) | (tr > cut ? 2 : 0) | (bl > cut ? 4 : 0) | (br > cut ? 8 : 0);
						target.fillStyle = ramp[hi] as string;
						target.fillText(QUADS[bits] as string, col * cellW, yTop + baseline);
					}
				}
			}
			target.setTransform(1, 0, 0, 1, 0, 0);
		};

		const sizeField = (c: HTMLCanvasElement, w: number, h: number): void => {
			c.width = Math.round(w * dpr);
			c.height = Math.round(h * dpr);
		};

		const layout = (): void => {
			if (disposed) return;
			const w = host.clientWidth;
			const h = host.clientHeight;
			if (w < 8 || h < 8) return;
			dpr = Math.min(2, window.devicePixelRatio || 1);
			measureCell();
			cols = Math.max(1, Math.ceil(w / cellW));
			rows = Math.max(1, Math.ceil(h / cellH));
			canvas.width = Math.round(w * dpr);
			canvas.height = Math.round(h * dpr);
			canvas.style.width = `${w}px`;
			canvas.style.height = `${h}px`;
			sizeField(fieldA, w, h);
			sizeField(fieldB, w, h);
			wet = new Float32Array(cols * rows);
			pool = new Float32Array(cols);
			wipeFront = new Float32Array(cols);
			wipeSpeed = new Float32Array(cols);
			beads = [];
			drips = [];
			wipeUntil = 0;
			const img = load(plateIdx);
			if (img) rasterize(frontCtx, img);
			draw(performance.now());
		};

		/** Start the next plate running down over the current one. */
		const nextPlate = (): void => {
			if (plates.length < 2 || wipeUntil > performance.now() || reduce) return;
			const next = (plateIdx + 1) % plates.length;
			const img = load(next);
			if (!img) return;
			rasterize(backCtx, img);
			// a small ragged stagger reads as one running front; a large one
			// just shreds the frame into static.
			for (let c = 0; c < cols; c++) {
				wipeFront[c] = -Math.random() * rows * 0.06;
				wipeSpeed[c] = 0.86 + Math.random() * 0.28;
			}
			plateIdx = next;
			wipeUntil = performance.now() + WIPE_MS;
		};

		const finishWipe = (): void => {
			const tmp = front;
			const tmpCtx = frontCtx;
			front = back;
			frontCtx = backCtx;
			back = tmp;
			backCtx = tmpCtx;
			wipeUntil = 0;
		};

		const soak = (col: number, row: number, amount: number): void => {
			if (col < 0 || col >= cols || row < 0 || row >= rows) return;
			const i = row * cols + col;
			wet[i] = Math.min(1.6, (wet[i] ?? 0) + amount);
			if (col > 0) wet[i - 1] = Math.min(1, (wet[i - 1] ?? 0) + amount * 0.22);
			if (col < cols - 1) wet[i + 1] = Math.min(1, (wet[i + 1] ?? 0) + amount * 0.22);
		};

		const spawnBead = (): void => {
			if (cols === 0 || rows === 0 || beads.length > 44) return;
			const h = runtime.current.heat;
			for (let tries = 0; tries < 8; tries++) {
				const col =
					h > 0.4
						? Math.max(0, Math.min(cols - 1, (cols / 2 + (Math.random() - 0.5) * cols * 0.66) | 0))
						: (Math.random() * cols) | 0;
				const row = (Math.random() * rows * 0.86) | 0;
				if ((bright[row * cols + col] ?? 0) >= 6) {
					beads.push({ col, row, swell: 0, rate: 0.012 + Math.random() * 0.03 });
					return;
				}
			}
		};

		const fluid = (): void => {
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.font = font;
			ctx.textBaseline = "alphabetic";

			ctx.globalCompositeOperation = "lighter";
			for (let row = 0; row < rows; row++) {
				for (let col = 0; col < cols; col++) {
					const v = wet[row * cols + col] as number;
					if (v < 0.03) continue;
					ctx.globalAlpha = Math.min(0.7, v * 0.58);
					ctx.fillStyle = ramp[v > 0.8 ? 6 : 5] as string;
					ctx.fillRect(col * cellW, row * cellH, cellW + 0.5, cellH + 0.5);
				}
			}
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = 1;

			const floor = rows * cellH;
			for (let col = 0; col < cols; col++) {
				const depth = pool[col] as number;
				if (depth < 0.05) continue;
				ctx.fillStyle = ramp[5] as string;
				ctx.fillRect(col * cellW, floor - depth * cellH, cellW + 0.5, depth * cellH);
				ctx.globalAlpha = 0.55;
				ctx.fillStyle = ramp[6] as string;
				ctx.fillRect(col * cellW, floor - depth * cellH, cellW + 0.5, 1.5);
				ctx.globalAlpha = 1;
			}

			for (const b of beads) {
				const s = Math.min(1, b.swell);
				const bw = cellW * (0.24 + s * 0.62);
				const bh = cellH * (0.2 + s * 0.66);
				ctx.globalAlpha = 0.4 + s * 0.6;
				ctx.fillStyle = ramp[s > 0.7 ? 6 : 5] as string;
				ctx.fillRect(b.col * cellW + (cellW - bw) / 2, b.row * cellH + (cellH - bh) / 2, bw, bh);
				if (s > 0.55) {
					ctx.globalAlpha = (s - 0.55) * 1.6;
					ctx.fillStyle = ramp[8] as string;
					ctx.fillRect(b.col * cellW + cellW * 0.3, b.row * cellH + cellH * 0.28, Math.max(1, cellW * 0.2), 1.5);
				}
			}
			ctx.globalAlpha = 1;

			for (const d of drips) {
				const x = d.col * cellW;
				const head = d.row * cellH;
				const tail = Math.min(9, 1.5 + d.vel * 9) * cellH;
				const grad = ctx.createLinearGradient(0, head - tail, 0, head);
				grad.addColorStop(0, "transparent");
				grad.addColorStop(1, ramp[5] as string);
				ctx.globalAlpha = 0.62 * d.life;
				ctx.fillStyle = grad;
				ctx.fillRect(x + cellW * 0.26, head - tail, Math.max(1, cellW * 0.48), tail);
				ctx.globalAlpha = Math.min(1, d.life * 1.3);
				ctx.fillStyle = ramp[6] as string;
				ctx.fillRect(x + cellW * 0.14, head, Math.max(1.5, cellW * 0.72), cellH * 0.74);
				ctx.globalAlpha = Math.min(1, d.life);
				ctx.fillStyle = ramp[8] as string;
				ctx.fillRect(x + cellW * 0.34, head + cellH * 0.1, Math.max(1, cellW * 0.16), 2);
			}
			ctx.globalAlpha = 1;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
		};

		const draw = (now: number): void => {
			const r = runtime.current;
			const w = canvas.width;
			const h = canvas.height;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = 1;

			if (now < r.tearUntil) {
				const t = (r.tearUntil - now) / TEAR_MS;
				ctx.fillStyle = ramp[0] as string;
				ctx.fillRect(0, 0, w, h);
				const slices = 13;
				const sh = Math.ceil(h / slices);
				for (let i = 0; i < slices; i++) {
					const dx = (Math.random() - 0.5) * 130 * t * dpr;
					ctx.drawImage(front, 0, i * sh, w, sh, dx, i * sh, w, sh);
				}
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha = 0.22 * t;
				ctx.drawImage(front, 7 * dpr, 0);
				ctx.globalCompositeOperation = "source-over";
				ctx.globalAlpha = 1;
			} else if (wipeUntil > 0) {
				// drip-wipe: the next plate runs down behind a ragged blood front
				const cw = cellW * dpr;
				for (let c = 0; c < cols; c++) {
					const f = Math.max(0, Math.min(rows, wipeFront[c] as number));
					const py = f * cellH * dpr;
					const x = c * cw;
					if (py > 0) ctx.drawImage(back, x, 0, cw + 1, py, x, 0, cw + 1, py);
					if (py < h) ctx.drawImage(front, x, py, cw + 1, h - py, x, py, cw + 1, h - py);
					if (py > 0 && py < h) {
						// the wet front itself
						ctx.fillStyle = ramp[6] as string;
						ctx.fillRect(x, py - 3 * dpr, cw + 1, 3.5 * dpr);
						ctx.globalAlpha = 0.5;
						ctx.fillStyle = ramp[8] as string;
						ctx.fillRect(x, py - 1 * dpr, cw + 1, 1.5 * dpr);
						ctx.globalAlpha = 1;
					}
				}
			} else {
				ctx.drawImage(front, 0, 0);
			}

			const beat = 0.5 + 0.5 * Math.sin(now / (900 - r.heat * 520));
			const flush = now < r.flushUntil ? (r.flushUntil - now) / FLUSH_MS : 0;
			ctx.globalCompositeOperation = "screen";
			ctx.globalAlpha = 0.015 + (0.02 + r.heat * 0.09) * beat + flush * 0.16;
			ctx.fillStyle = ramp[6] as string;
			ctx.fillRect(0, 0, w, h);
			ctx.globalCompositeOperation = "source-over";
			ctx.globalAlpha = 1;

			fluid();

			if (now < r.emberUntil) {
				const t = (r.emberUntil - now) / EMBER_MS;
				const cx = r.emberX * w;
				const cy = r.emberY * h;
				const rad = Math.max(1, (1.25 - t) * Math.max(w, h) * 0.34);
				const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
				glow.addColorStop(0, ramp[7] as string);
				glow.addColorStop(1, "transparent");
				ctx.globalCompositeOperation = "lighter";
				ctx.globalAlpha = 0.32 * t * t;
				ctx.fillStyle = glow;
				ctx.fillRect(0, 0, w, h);
				ctx.globalCompositeOperation = "source-over";
				ctx.globalAlpha = 1;
			}
		};

		const step = (): void => {
			const now = performance.now();
			const h = runtime.current.heat;
			if (seenAdvance !== advanceRef.current) {
				seenAdvance = advanceRef.current;
				nextPlate();
			}
			if (wipeUntil > 0) {
				let done = true;
				for (let c = 0; c < cols; c++) {
					const v = (wipeFront[c] as number) + (wipeSpeed[c] as number) * (rows / (WIPE_MS / 16));
					wipeFront[c] = v;
					if (v < rows) done = false;
					if (v > 0 && v < rows) soak(c, Math.floor(v), 0.22);
				}
				if (done || now > wipeUntil + 400) finishWipe();
			}

			if (Math.random() < 0.18 + h * 0.55 + (now < runtime.current.flushUntil ? 0.9 : 0)) spawnBead();

			for (let i = beads.length - 1; i >= 0; i--) {
				const b = beads[i] as Bead;
				b.swell += b.rate * (1 + h);
				soak(b.col, b.row, 0.012);
				if (b.swell >= 1.25) {
					drips.push({ col: b.col, row: b.row, vel: 0.06, life: 1 });
					beads.splice(i, 1);
				}
			}

			for (let i = drips.length - 1; i >= 0; i--) {
				const d = drips[i] as Drip;
				d.vel = Math.min(1.4, d.vel + 0.028 + h * 0.02);
				const before = d.row;
				d.row += d.vel;
				for (let rr = Math.floor(before); rr <= Math.floor(d.row); rr++) soak(d.col, rr, 0.42);
				d.life -= 0.006;
				const bottom = rows - (pool[d.col] as number);
				if (d.row >= bottom || d.life <= 0) {
					if (d.row >= bottom) pool[d.col] = Math.min(rows * 0.3, (pool[d.col] as number) + 0.22);
					drips.splice(i, 1);
				}
			}

			for (let i = 0; i < wet.length; i++) {
				const v = wet[i] as number;
				if (v > 0) wet[i] = v > 0.004 ? v * 0.978 : 0;
			}
			for (let c = 0; c < pool.length; c++) {
				const v = pool[c] as number;
				if (v > 0) pool[c] = v > 0.01 ? v - 0.0018 : 0;
			}
		};

		const frame = (now: number): void => {
			if (disposed) return;
			step();
			draw(now);
			raf = requestAnimationFrame(frame);
		};

		layout();
		if (!reduce) {
			raf = requestAnimationFrame(frame);
			if (rotateMs > 0 && plates.length > 1) rotator = window.setInterval(nextPlate, rotateMs);
		}

		const ro = new ResizeObserver(() => {
			window.clearTimeout(relayout);
			relayout = window.setTimeout(layout, 150);
		});
		ro.observe(host);

		const onVisibility = (): void => {
			if (document.hidden) {
				cancelAnimationFrame(raf);
				raf = 0;
			} else if (raf === 0 && !reduce) {
				raf = requestAnimationFrame(frame);
			}
		};
		document.addEventListener("visibilitychange", onVisibility);

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			window.clearTimeout(relayout);
			window.clearInterval(rotator);
			ro.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [plates, start, rotateMs]);

	return (
		<div ref={hostRef} className={className === undefined ? "wl-wall" : `wl-wall ${className}`} aria-hidden="true">
			<canvas ref={canvasRef} className="wl-canvas" style={{ opacity: burn }} />
			<div className="wl-scan" />
		</div>
	);
}
