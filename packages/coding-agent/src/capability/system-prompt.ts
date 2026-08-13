/**
 * EROS System Overlay Capability
 *
 * EROS-owned SYSTEM.md files add domain law without replacing her bundled
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
	/** Which level this came from */
	level: "user" | "project";
	/** Source metadata */
	_source: SourceMeta;
}

export const systemPromptCapability = defineCapability<SystemPrompt>({
	id: "system-prompt",
	displayName: "EROS System Overlay",
	description: "EROS-owned SYSTEM.md overlays that shape work without replacing her identity",
	key: sp => sp.level,
	validate: sp => {
		if (!sp.path) return "Missing path";
		if (sp.content === undefined) return "Missing content";
		return undefined;
	},
});
