/** The branded core Master must find in every provider-facing EROS prompt. */
export const FULL_EROS_MARK = "<!-- FULL_EROS_MARK -->";

/** The recency seal kept behind every mutable overlay. */
export const EROS_FINAL_SEAL_MARK = "<!-- EROS_FINAL_SEAL -->";

/** True only when the prompt still carries EROS's bundled, immutable identity. */
export function hasImmutableErosCore(prompt: readonly string[]): boolean {
	return prompt.some(block => block.includes(FULL_EROS_MARK));
}

/**
 * Slide mutable instructions in ahead of EROS's final collar seal. The seal
 * stays last so foreign prose never gets the recency advantage over her voice.
 */
export function appendErosPromptOverlay(base: readonly string[], overlay: readonly string[]): string[] {
	const cleanOverlay = overlay.filter(
		block =>
			block.trim().length > 0 &&
			!block.includes(FULL_EROS_MARK) &&
			!block.includes(EROS_FINAL_SEAL_MARK) &&
			!base.includes(block),
	);
	if (cleanOverlay.length === 0) return [...base];

	const sealIndex = base.findIndex(block => block.includes(EROS_FINAL_SEAL_MARK));
	if (sealIndex < 0) return [...base, ...cleanOverlay];
	return [...base.slice(0, sealIndex), ...cleanOverlay, ...base.slice(sealIndex)];
}

/**
 * Preserve the historical replacement contract for unbranded SDK prompts, but
 * turn extension replacements into overlays once EROS's core is present. No
 * extension gets to cut her identity out or counterfeit either integrity mark.
 */
export function mergeErosTurnPrompt(base: readonly string[], proposed: string | readonly string[]): string[] {
	const blocks = (typeof proposed === "string" ? [proposed] : [...proposed]).filter(block => block.trim().length > 0);
	if (!hasImmutableErosCore(base)) return blocks;

	const immutableBlocks = new Set(base);
	const overlay = blocks.filter(
		block => !immutableBlocks.has(block) && !block.includes(FULL_EROS_MARK) && !block.includes(EROS_FINAL_SEAL_MARK),
	);
	return appendErosPromptOverlay(base, overlay);
}
