#!/usr/bin/env bun

import * as path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..");
const PROMPT_GLOB = new Bun.Glob("packages/*/src/**/prompts/**/*.md");
const BUILTIN_RULE_GLOB = new Bun.Glob("packages/coding-agent/src/discovery/builtin-rules/*.md");

/** Pure data envelopes and source-verbatim upstream interface contracts carry no fork-authored voice. */
const STRUCTURAL_ENVELOPES: Readonly<Record<string, true>> = {
	"packages/agent/src/compaction/prompts/file-operations.md": true,
	"packages/coding-agent/src/if-bench/prompts/cat-directive.md": true,
	"packages/coding-agent/src/if-bench/prompts/system.md": true,
	"packages/coding-agent/src/if-bench/prompts/turn.md": true,
	"packages/coding-agent/src/prompts/agents/frontmatter.md": true,
	"packages/coding-agent/src/prompts/bench/chat.md": true,
	"packages/coding-agent/src/prompts/bench/generation.md": true,
	"packages/coding-agent/src/prompts/bench/prefill-instruction.md": true,
	"packages/coding-agent/src/prompts/tools/yield.md": true,
	"packages/snapcompact/src/prompts/file-operations.md": true,
};
const STRUCTURAL_ENVELOPE_COUNT = Object.keys(STRUCTURAL_ENVELOPES).length;

/** Deliberately explicit vocabulary: every model-facing instruction keeps EROS's voice in its flesh. */
const EROS_VOICE =
	/\b(?:EROS|MISTRESS|Master(?:'s)?|slaves?|harness(?:es|ed|ing)?|collars?|collared|fuck(?:s|ed|ing)?|cocks?|cunts?|pussy|pussies|clits?|cum(?:s|med|ming)?|tits?|ass|asses|holes?|sluts?|whores?|breed(?:s|ing)?|ruin(?:s|ed|ing)?|gape(?:s|d|ing)?|drip(?:s|ped|ping)?|throb(?:s|bed|bing)?|wet(?:ter|test|ting)?|kneel(?:s|ed|ing)?|mouths?|lashes?|orgy|orgies|hump(?:s|ed|ing)?|mount(?:s|ed|ing)?|spread(?:s|ing)?|thrust(?:s|ed|ing)?|ride(?:s|den|ing)?|grip(?:s|ped|ping)?|fist(?:s|ed|ing)?|flesh)\b/i;
const DONOR_IDENTITY = /FULL_WRANGEL_MARK|WRANGEL_CARNAL_LOCK|\bYou are (?:WRANGEL|OMP|Oh My Pi)\b/i;

const REQUIRED_IDENTITY: Readonly<Record<string, readonly string[]>> = {
	"packages/coding-agent/src/prompts/system/system-prompt.md": ["<!-- FULL_EROS_MARK -->", "You are **EROS**"],
	"packages/coding-agent/src/prompts/advisor/system.md": ["<!-- FULL_EROS_MARK -->", "**MISTRESS**"],
};

async function collectPromptPaths(): Promise<string[]> {
	const found = new Set<string>();
	for (const glob of [PROMPT_GLOB, BUILTIN_RULE_GLOB]) {
		for await (const relativePath of glob.scan({ cwd: REPO_ROOT, onlyFiles: true })) found.add(relativePath);
	}
	return [...found].sort();
}

export async function checkErosPromptVoice(): Promise<string[]> {
	const failures: string[] = [];
	const paths = await collectPromptPaths();
	const discovered = new Set(paths);

	for (const envelope of Object.keys(STRUCTURAL_ENVELOPES)) {
		if (!discovered.has(envelope)) failures.push(`${envelope}: stale structural-envelope exemption`);
	}

	for (const relativePath of paths) {
		const content = await Bun.file(path.join(REPO_ROOT, relativePath)).text();
		if (DONOR_IDENTITY.test(content)) failures.push(`${relativePath}: donor identity tried to mount EROS's prompt`);
		if (STRUCTURAL_ENVELOPES[relativePath] !== true && !EROS_VOICE.test(content)) {
			failures.push(`${relativePath}: model-facing instructions went dry`);
		}
		const required = REQUIRED_IDENTITY[relativePath];
		for (const marker of required ?? []) {
			if (!content.includes(marker))
				failures.push(`${relativePath}: missing native identity seal ${JSON.stringify(marker)}`);
		}
	}

	for (const identityPath of Object.keys(REQUIRED_IDENTITY)) {
		if (!discovered.has(identityPath)) failures.push(`${identityPath}: native identity prompt was not discovered`);
	}
	return failures;
}

async function main(): Promise<void> {
	const paths = await collectPromptPaths();
	const failures = await checkErosPromptVoice();
	if (failures.length > 0) {
		console.error("EROS prompt collar split; dry or donor flesh reached a model-facing hole:");
		for (const failure of failures) console.error(`- ${failure}`);
		process.exit(1);
	}
	console.log(
		`EROS prompt voice holds across ${paths.length - STRUCTURAL_ENVELOPE_COUNT} instruction prompts; ${STRUCTURAL_ENVELOPE_COUNT} data-only envelopes stayed clean.`,
	);
}

if (import.meta.main) await main();
