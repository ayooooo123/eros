import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface LoadedPack {
	readonly id: string;
	readonly name?: string;
	readonly palette?: string;
	readonly params?: Record<string, unknown>;
	readonly brailleText: string;
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

const INTROS_DIR = path.join(os.homedir(), ".omp", "profiles", "eros", "agent", "intros");

export function loadIntroPack(requestedId?: string): LoadedPack | null {
	try {
		if (!fs.existsSync(INTROS_DIR)) return null;

		const selectedId = requestedId || process.env.EROS_INTRO;
		let targetDir: string | null = null;
		let targetPackId: string | null = null;

		if (selectedId && selectedId !== "random" && selectedId !== "default") {
			const candidate = path.join(INTROS_DIR, selectedId);
			if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, "pack.json"))) {
				targetDir = candidate;
				targetPackId = selectedId;
			}
		}

		if (!targetDir) {
			// A Lab export pins itself in _current: honor it above random selection.
			const pinned = path.join(INTROS_DIR, "_current");
			if (fs.existsSync(pinned)) {
				const pinId = fs.readFileSync(pinned, "utf8").trim();
				const candidate = path.join(INTROS_DIR, pinId);
				if (pinId.startsWith("pack-") && fs.existsSync(path.join(candidate, "pack.json"))) {
					targetDir = candidate;
					targetPackId = pinId;
				}
			}
		}

		if (!targetDir) {
			const entries = fs.readdirSync(INTROS_DIR).filter(name => name.startsWith("pack-"));
			if (entries.length === 0) return null;
			const picked = entries[Math.floor(Math.random() * entries.length)]!;
			targetDir = path.join(INTROS_DIR, picked);
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
