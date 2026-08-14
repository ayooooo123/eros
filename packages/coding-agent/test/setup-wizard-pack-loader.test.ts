import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadIntroPack } from "@oh-my-pi/pi-coding-agent/modes/setup-wizard/scenes/pack-loader";
import { __resetDirsFromEnvForTests, removeWithRetries, setAgentDir } from "@oh-my-pi/pi-utils";

const ENV_KEYS = ["EROS_INTRO", "OMP_PROFILE", "PI_CODING_AGENT_DIR", "PI_PROFILE"] as const;

type SavedEnvironment = Record<(typeof ENV_KEYS)[number], string | undefined>;

let tempRoot = "";
let savedEnvironment: SavedEnvironment;

function restoreEnvironment(key: string, value: string | undefined): void {
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
}

async function writePack(introsDir: string, id: string, marker: string): Promise<void> {
	const packDir = path.join(introsDir, id);
	await fsp.mkdir(packDir, { recursive: true });
	await Promise.all([
		fsp.writeFile(path.join(packDir, "braille.txt"), `${marker}:braille\n`),
		fsp.writeFile(path.join(packDir, "hero-wide.txt"), `${marker}:wide\n`),
		fsp.writeFile(path.join(packDir, "hero-punch.txt"), `${marker}:punch\n`),
		fsp.writeFile(path.join(packDir, "welcome-strip.txt"), `${marker}:strip\n`),
		fsp.writeFile(path.join(packDir, "drips.txt"), `${marker}:drips\n`),
		fsp.writeFile(path.join(packDir, "pack.json"), JSON.stringify({ name: marker })),
	]);
}

describe("EROS intro pack loader", () => {
	beforeEach(async () => {
		savedEnvironment = {
			EROS_INTRO: process.env.EROS_INTRO,
			OMP_PROFILE: process.env.OMP_PROFILE,
			PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
			PI_PROFILE: process.env.PI_PROFILE,
		};
		delete process.env.EROS_INTRO;
		tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "eros-pack-loader-"));
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		for (const key of ENV_KEYS) restoreEnvironment(key, savedEnvironment[key]);
		__resetDirsFromEnvForTests();
		if (tempRoot) await removeWithRetries(tempRoot);
	});

	test("uses each live standalone agent intros directory, honoring _current instead of the retired profile path", async () => {
		const firstAgentDir = path.join(tempRoot, "standalone-one");
		const secondAgentDir = path.join(tempRoot, "standalone-two");
		const firstIntrosDir = path.join(firstAgentDir, "intros");
		const secondIntrosDir = path.join(secondAgentDir, "intros");
		const legacyIntrosDir = path.join(tempRoot, "legacy-home", ".omp", "profiles", "eros", "agent", "intros");

		await writePack(firstIntrosDir, "pack-live", "live");
		await writePack(firstIntrosDir, "pack-unpinned", "unpinned");
		await fsp.writeFile(path.join(firstIntrosDir, "_current"), "pack-live\n");
		await writePack(legacyIntrosDir, "pack-legacy", "legacy");
		await fsp.writeFile(path.join(legacyIntrosDir, "_current"), "pack-legacy\n");

		const existsSpy = vi.spyOn(fs, "existsSync");
		setAgentDir(firstAgentDir);
		const first = loadIntroPack();

		expect(first?.id).toBe("pack-live");
		expect(first?.brailleText).toBe("live:braille\n");

		await writePack(secondIntrosDir, "pack-next", "next");
		await fsp.writeFile(path.join(secondIntrosDir, "_current"), "pack-next\n");
		setAgentDir(secondAgentDir);
		const second = loadIntroPack();

		expect(second?.id).toBe("pack-next");
		expect(second?.brailleText).toBe("next:braille\n");
		const checkedPaths = existsSpy.mock.calls.map(([candidate]) => String(candidate));
		expect(checkedPaths).not.toContain(legacyIntrosDir);
		expect(checkedPaths.some(candidate => candidate.includes(".omp/profiles/eros/agent/intros"))).toBe(false);
	});
});
