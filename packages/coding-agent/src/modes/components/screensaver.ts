import { type Component, type OverlayFocusOwner } from "@oh-my-pi/pi-tui";
import type { InteractiveModeContext } from "../types";
import { createErosRenderer, type ErosRenderer, SETUP_TICK_MS } from "../setup-wizard/scenes/splash";

/**
 * The forge's idle state: after a turn ends and the session sits untouched, the
 * whole TUI sinks into the screensaver — a full-screen loop of the pack art:
 * braille morphs, color blooms, throb, drips. When one sequence finishes, a new
 * random pack takes over, so the show never exactly repeats. Any key dismisses.
 */
export class ErosScreensaverComponent implements Component, OverlayFocusOwner {
	#renderer: ErosRenderer = createErosRenderer();
	#startedAt = performance.now();
	#timer: NodeJS.Timeout | undefined;
	#disposed = false;
	readonly #onDismiss: () => void;

	constructor(
		readonly ctx: InteractiveModeContext,
		onDismiss: () => void,
	) {
		this.#onDismiss = onDismiss;
	}

	start(): void {
		if (this.#timer) return;
		this.#timer = setInterval(() => {
			if (this.#disposed) return;
			this.ctx.ui.requestRender();
		}, SETUP_TICK_MS);
		this.#timer.unref?.();
	}

	ownsOverlayFocusTarget(component: Component): boolean {
		return component === this;
	}

	/** Any keypress dismisses the screensaver and hands focus back to the editor. */
	handleInput(_data: string): void {
		this.dismiss();
	}

	render(width: number): readonly string[] {
		let elapsed = performance.now() - this.#startedAt;
		if (elapsed > this.#renderer.durationMs + 700) {
			// Cycle to a fresh random pack — never the same show twice.
			this.#renderer = createErosRenderer();
			this.#startedAt = performance.now();
			elapsed = 0;
		}
		return this.#renderer.render(Math.max(1, width), Math.max(1, this.ctx.ui.terminal.rows), elapsed);
	}

	dismiss(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		if (this.#timer) {
			clearInterval(this.#timer);
			this.#timer = undefined;
		}
		this.#onDismiss();
	}

	dispose(): void {
		this.dismiss();
	}
}
