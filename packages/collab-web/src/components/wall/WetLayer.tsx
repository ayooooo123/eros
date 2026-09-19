import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import "./wall.css";

/**
 * The wet layer — one fixed canvas over the entire app for fluid that has to
 * cross UI boundaries. The wall drips on its own; this is what the *interface*
 * does when you touch it.
 *
 * - `spurt(el)` — a send lands: a burst launched out of the button, gravity takes
 *   it, each drop sticks where it falls and runs down leaving a trail.
 * - `smear(el)` — an error: a wide mess dragged down the screen in fingers.
 * - `bleed(el)` — a slow single weep out of one element.
 *
 * Everything is snapped to the character grid and drawn in ramp colours, so the
 * mess stays part of the terminal instead of turning into web-app confetti.
 * `prefers-reduced-motion` leaves the layer inert and every call a no-op.
 */

interface Drop {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	fat: number;
}

interface Runner {
	col: number;
	y: number;
	vy: number;
	life: number;
	fat: number;
	/** Top of the streak this runner has already laid down. */
	from: number;
}

interface Sink {
	spurt(x: number, y: number, power: number): void;
	smear(x: number, y: number, width: number): void;
	bleed(x: number, y: number): void;
}

let sink: Sink | null = null;

function centreOf(el: Element | null | undefined): { x: number; y: number; w: number } | null {
	if (!el) return null;
	const r = el.getBoundingClientRect();
	if (r.width === 0 && r.height === 0) return null;
	return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
}

/** A send, a commit, a confirmation: it bursts, it lands, it runs. */
export function spurt(el: Element | null | undefined, power = 1): void {
	const c = centreOf(el);
	if (c && sink) sink.spurt(c.x, c.y, power);
}

/** An error: something is dragged down the screen and left there. */
export function smear(el: Element | null | undefined): void {
	const c = centreOf(el);
	if (c && sink) sink.smear(c.x, c.y, Math.max(120, c.w));
}

/** A slow weep out of one element. */
export function bleed(el: Element | null | undefined): void {
	const c = centreOf(el);
	if (c && sink) sink.bleed(c.x, c.y);
}

/** The connection was cut: the whole pane runs. */
export function drench(): void {
	if (!sink) return;
	const w = window.innerWidth;
	for (let i = 0; i < 5; i++) {
		sink.smear((i + 0.5) * (w / 5), -12, w / 4);
	}
}

const RAMP_VARS = ["--blood-deep", "--blood", "--hot-blood", "--rose", "--blush"] as const;

export function WetLayer(): ReactNode {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		const rootStyle = getComputedStyle(document.documentElement);
		const ramp = RAMP_VARS.map(v => rootStyle.getPropertyValue(v).trim() || "#c8102e");
		const cellFs = Number.parseFloat(rootStyle.getPropertyValue("--cell-fs")) || 13;
		const cellH = Number.parseFloat(rootStyle.getPropertyValue("--cell-lh")) || 18;
		ctx.font = `${cellFs}px ${rootStyle.getPropertyValue("--font-mono").trim() || "monospace"}`;
		const cellW = ctx.measureText("0").width || cellFs * 0.6;

		let dpr = 1;
		const drops: Drop[] = [];
		const runners: Runner[] = [];
		/** Persistent streaks: col, top, bottom, alpha, fat. */
		let streaks: Float32Array[] = [];
		let raf = 0;
		let disposed = false;

		const resize = (): void => {
			dpr = Math.min(2, window.devicePixelRatio || 1);
			canvas.width = Math.round(window.innerWidth * dpr);
			canvas.height = Math.round(window.innerHeight * dpr);
			canvas.style.width = `${window.innerWidth}px`;
			canvas.style.height = `${window.innerHeight}px`;
		};
		resize();

		const land = (x: number, y: number, fat: number): void => {
			const col = Math.round(x / cellW);
			runners.push({ col, y, vy: 0.2 + Math.random() * 0.6, life: 1, fat, from: y });
		};

		sink = {
			spurt(x, y, power) {
				const n = Math.round((14 + Math.random() * 10) * power);
				for (let i = 0; i < n; i++) {
					const spread = (Math.random() - 0.5) * 2;
					drops.push({
						x,
						y,
						vx: spread * (2.4 + Math.random() * 5.2) * power,
						vy: -(3.4 + Math.random() * 6.4) * power,
						life: 1,
						fat: 0.4 + Math.random() * 0.9,
					});
				}
				// a thick one that goes straight up and comes straight back
				drops.push({
					x,
					y,
					vx: (Math.random() - 0.5) * 1.4,
					vy: -(9 + Math.random() * 4) * power,
					life: 1,
					fat: 1.5,
				});
			},
			smear(x, y, width) {
				const fingers = 7 + ((Math.random() * 5) | 0);
				for (let i = 0; i < fingers; i++) {
					const fx = x + (i / (fingers - 1) - 0.5) * width;
					runners.push({
						col: Math.round(fx / cellW),
						y,
						vy: 0.5 + Math.random() * 2.4,
						life: 1,
						fat: 0.7 + Math.random() * 1.3,
						from: y,
					});
				}
			},
			bleed(x, y) {
				runners.push({ col: Math.round(x / cellW), y, vy: 0.14, life: 1, fat: 0.5, from: y });
			},
		};

		const step = (): void => {
			for (let i = drops.length - 1; i >= 0; i--) {
				const d = drops[i] as Drop;
				d.vy += 0.62;
				d.x += d.vx;
				d.y += d.vy;
				d.life -= 0.02;
				const offscreen = d.x < -20 || d.x > window.innerWidth + 20 || d.y > window.innerHeight + 20;
				// it sticks once it is falling and has spent its throw
				if (!offscreen && d.vy > 5 && Math.random() < 0.22) {
					land(d.x, d.y, d.fat);
					drops.splice(i, 1);
				} else if (offscreen || d.life <= 0) {
					if (!offscreen) land(d.x, d.y, d.fat);
					drops.splice(i, 1);
				}
			}

			for (let i = runners.length - 1; i >= 0; i--) {
				const r = runners[i] as Runner;
				r.vy = Math.min(6, r.vy * 1.035 + 0.06);
				r.y += r.vy;
				r.life -= 0.0055;
				if (r.y - r.from > cellH * 0.9) {
					streaks.push(Float32Array.of(r.col, r.from, r.y, 0.5 * r.life, r.fat));
					r.from = r.y;
				}
				if (r.life <= 0 || r.y > window.innerHeight + 40) {
					streaks.push(
						Float32Array.of(r.col, r.from, Math.min(r.y, window.innerHeight + 40), 0.42 * r.life, r.fat),
					);
					runners.splice(i, 1);
				}
			}

			if (streaks.length > 900) streaks = streaks.slice(-900);
			for (let i = streaks.length - 1; i >= 0; i--) {
				const s = streaks[i] as Float32Array;
				s[3] = (s[3] as number) * 0.985;
				if ((s[3] as number) < 0.01) streaks.splice(i, 1);
			}
		};

		const draw = (): void => {
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			if (drops.length === 0 && runners.length === 0 && streaks.length === 0) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// the mess left on the glass
			for (const s of streaks) {
				const col = s[0] as number;
				const y0 = s[1] as number;
				const y1 = s[2] as number;
				const a = s[3] as number;
				const fat = s[4] as number;
				ctx.globalAlpha = Math.min(0.6, a);
				ctx.fillStyle = ramp[1] as string;
				ctx.fillRect(col * cellW, y0, Math.max(1, cellW * 0.42 * fat), y1 - y0);
			}

			// what is still running
			for (const r of runners) {
				const x = r.col * cellW;
				const tail = Math.min(90, 12 + r.vy * 16);
				const grad = ctx.createLinearGradient(0, r.y - tail, 0, r.y);
				grad.addColorStop(0, "transparent");
				grad.addColorStop(1, ramp[1] as string);
				ctx.globalAlpha = 0.7 * r.life;
				ctx.fillStyle = grad;
				ctx.fillRect(x, r.y - tail, Math.max(1, cellW * 0.5 * r.fat), tail);
				ctx.globalAlpha = Math.min(1, r.life * 1.2);
				ctx.fillStyle = ramp[2] as string;
				ctx.fillRect(x - cellW * 0.08, r.y, Math.max(1.5, cellW * 0.66 * r.fat), cellH * 0.7);
				ctx.globalAlpha = r.life * 0.9;
				ctx.fillStyle = ramp[4] as string;
				ctx.fillRect(x + cellW * 0.16, r.y + cellH * 0.12, Math.max(1, cellW * 0.18), 2);
			}

			// what is still in the air
			for (const d of drops) {
				const w = Math.max(2, cellW * 0.5 * d.fat);
				const h = Math.max(2, cellH * 0.42 * d.fat);
				// stretched along its own velocity: fluid, not confetti
				const stretch = Math.min(3.4, 1 + Math.abs(d.vy) * 0.16);
				ctx.globalAlpha = Math.min(1, d.life * 1.4);
				ctx.fillStyle = ramp[2] as string;
				ctx.fillRect(d.x - w / 2, d.y - (h * stretch) / 2, w, h * stretch);
				ctx.globalAlpha = Math.min(1, d.life);
				ctx.fillStyle = ramp[4] as string;
				ctx.fillRect(d.x - w * 0.16, d.y - h * 0.3, Math.max(1, w * 0.3), Math.max(1, h * 0.4));
			}
			ctx.globalAlpha = 1;
		};

		const frame = (): void => {
			if (disposed) return;
			step();
			draw();
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		window.addEventListener("resize", resize);

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			window.removeEventListener("resize", resize);
			sink = null;
		};
	}, []);

	return <canvas ref={canvasRef} className="wl-wet" aria-hidden="true" />;
}
