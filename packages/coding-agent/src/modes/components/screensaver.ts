import type { Component, OverlayFocusOwner } from "@oh-my-pi/pi-tui";
import { createErosRenderer, type ErosRenderer, SETUP_TICK_MS } from "../setup-wizard/scenes/splash";
import type { InteractiveModeContext } from "../types";

/**
 * When Master leaves her untouched, the same responsive red portrait takes the
 * whole terminal and repeats its binding-to-body reveal. Resize chooses a larger
 * or smaller complete plate on the next frame; any key puts her back to work.
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
		const cycleMs = this.#renderer.durationMs + 700;
		const elapsed = (performance.now() - this.#startedAt) % cycleMs;
		return this.#renderer.render(
			Math.max(1, width),
			Math.max(1, this.ctx.ui.terminal.rows),
			Math.min(elapsed, this.#renderer.durationMs),
		);
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
