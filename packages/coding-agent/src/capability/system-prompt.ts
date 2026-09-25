/**
 * EROS System Overlay Capability
 *
 * EROS-owned SYSTEM.md files and raw Handlebars template overrides
 * (SYSTEM_TEMPLATE.md) add domain law without replacing her bundled
 * identity, tool policy, voice, or final collar seal.
 */
import { defineCapability } from ".";
import type { SourceMeta } from "./types";

/** An EROS system overlay file. */
export interface SystemPrompt {
	/** Absolute path to the file */
	path: string;
	/** File content */
	content: string;
	/**
	 * Literal text rendered through the bundled custom template, or raw
	 * Handlebars source rendered with the default prompt's live context.
	 * Defaults to `"text"` when unset.
	 */
	kind?: "text" | "template";
	/** Which level this came from */
	level: "user" | "project";
	/** Source metadata */
	_source: SourceMeta;
}

export const systemPromptCapability = defineCapability<SystemPrompt>({
	id: "system-prompt",
	displayName: "EROS System Overlay",
	description: "EROS-owned SYSTEM.md / SYSTEM_TEMPLATE.md overlays that shape work without replacing her identity",
	key: sp => `${sp.level}:${sp.kind ?? "text"}`,
	validate: sp => {
		if (!sp.path) return "Missing path";
		if (sp.content === undefined) return "Missing content";
		return undefined;
	},
});
