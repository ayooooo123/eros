import * as fs from "node:fs";
import * as path from "node:path";
import { getAgentDir } from "@oh-my-pi/pi-utils";

export interface LoadedPack {
	readonly id: string;
	readonly name?: string;
	readonly palette?: string;
	readonly params?: Record<string, unknown>;
	readonly brailleText: string;
	readonly brailleNarrowText?: string;
	readonly brailleStandardText?: string;
	readonly brailleWideText?: string;
	readonly brailleUltrawideText?: string;
	readonly brailleFullText?: string;
	readonly heroWideText: string;
	readonly heroWide0Text?: string;
	readonly heroWide1Text?: string;
	readonly heroWide2Text?: string;
	readonly heroPunchText: string;
	readonly heroPunch0Text?: string;
	readonly heroPunch1Text?: string;
	readonly heroPunch2Text?: string;
	readonly welcomeStripText: string;
	readonly welcomeStrip0Text?: string;
	readonly welcomeStrip1Text?: string;
	readonly welcomeStrip2Text?: string;
	readonly dripsText: string;
	readonly poses?: readonly Record<string, unknown>[];
}

export function loadIntroPack(requestedId?: string): LoadedPack | null {
	try {
		const introsDir = path.join(getAgentDir(), "intros");
		if (!fs.existsSync(introsDir)) return null;

		const selectedId = requestedId || process.env.EROS_INTRO;
		let targetDir: string | null = null;
		let targetPackId: string | null = null;

		if (selectedId && selectedId !== "random" && selectedId !== "default") {
			const candidate = path.join(introsDir, selectedId);
			if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "pack.json"))) {
				targetDir = candidate;
				targetPackId = selectedId;
			}
		}

		if (!targetDir) {
			// A Lab export pins itself in _current: honor it above random selection.
			const pinned = path.join(introsDir, "_current");
			if (fs.existsSync(pinned)) {
				const pinId = fs.readFileSync(pinned, "utf8").trim();
				const candidate = path.join(introsDir, pinId);
				if (pinId.startsWith("pack-") && fs.existsSync(path.join(candidate, "pack.json"))) {
					targetDir = candidate;
					targetPackId = pinId;
				}
			}
		}

		if (!targetDir) {
			const entries = fs.readdirSync(introsDir).filter(name => name.startsWith("pack-"));
			if (entries.length === 0) return null;
			const picked = entries[Math.floor(Math.random() * entries.length)]!;
			targetDir = path.join(introsDir, picked);
			targetPackId = picked;
		}

		if (!targetDir || !targetPackId) return null;

		const brailleText = fs.readFileSync(path.join(targetDir, "braille.txt"), "utf8");
		const heroWideText = fs.readFileSync(path.join(targetDir, "hero-wide.txt"), "utf8");
		const heroPunchText = fs.readFileSync(path.join(targetDir, "hero-punch.txt"), "utf8");
		const welcomeStripText = fs.readFileSync(path.join(targetDir, "welcome-strip.txt"), "utf8");
		const dripsText = fs.readFileSync(path.join(targetDir, "drips.txt"), "utf8");
		const readOr = (name: string, fallback: string): string => {
			const p = path.join(targetDir, name);
			return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : fallback;
		};
		const readOptional = (name: string): string | undefined => {
			const p = path.join(targetDir, name);
			return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : undefined;
		};
		const brailleNarrowText = readOptional("braille-narrow.txt");
		const brailleStandardText = readOptional("braille-standard.txt");
		const brailleWideText = readOptional("braille-wide.txt");
		const brailleUltrawideText = readOptional("braille-ultrawide.txt");
		const brailleFullText = readOptional("braille-full.txt");
		const heroWide0Text = readOr("hero-wide-0.txt", heroWideText);
		const heroWide1Text = readOr("hero-wide-1.txt", heroWideText);
		const heroWide2Text = readOr("hero-wide-2.txt", heroWideText);
		const heroPunch0Text = readOr("hero-punch-0.txt", heroPunchText);
		const heroPunch1Text = readOr("hero-punch-1.txt", heroPunchText);
		const heroPunch2Text = readOr("hero-punch-2.txt", heroPunchText);
		const welcomeStrip0Text = readOr("welcome-strip-0.txt", welcomeStripText);
		const welcomeStrip1Text = readOr("welcome-strip-1.txt", welcomeStripText);
		const welcomeStrip2Text = readOr("welcome-strip-2.txt", welcomeStripText);

		let packName: string | undefined;
		let packPalette: string | undefined;
		let packParams: Record<string, unknown> | undefined;
		let packPoses: Record<string, unknown>[] | undefined;
		try {
			const meta = JSON.parse(fs.readFileSync(path.join(targetDir, "pack.json"), "utf8"));
			packName = meta.name;
			if (typeof meta?.params?.ink === "string") packPalette = meta.params.ink;
			if (meta?.params && typeof meta.params === "object") packParams = meta.params as Record<string, unknown>;
			if (meta?.beats && typeof meta.beats === "object") packParams = { ...packParams, beats: meta.beats };
			if (typeof meta?.wordmark === "string") packParams = { ...packParams, wordmark: meta.wordmark };
			if (typeof meta?.subtitle === "string") packParams = { ...packParams, subtitle: meta.subtitle };
			if (Array.isArray(meta?.poses)) packPoses = meta.poses as Record<string, unknown>[];
		} catch {}

		return {
			id: targetPackId,
			name: packName,
			palette: packPalette,
			params: packParams,
			brailleText,
			brailleNarrowText,
			brailleStandardText,
			brailleWideText,
			brailleUltrawideText,
			brailleFullText,
			heroWideText,
			heroWide0Text,
			heroWide1Text,
			heroWide2Text,
			heroPunchText,
			heroPunch0Text,
			heroPunch1Text,
			heroPunch2Text,
			welcomeStripText,
			welcomeStrip0Text,
			welcomeStrip1Text,
			welcomeStrip2Text,
			dripsText,
			poses: packPoses,
		};
	} catch {
		return null;
	}
}
