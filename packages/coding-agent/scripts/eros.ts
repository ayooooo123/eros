/** Restore the caller's working directory before Eros imports snapshot it. */
const launchCwd = process.env.EROS_LAUNCH_CWD;
if (launchCwd) {
	delete process.env.EROS_LAUNCH_CWD;
	try {
		process.chdir(launchCwd);
	} catch {}
}
