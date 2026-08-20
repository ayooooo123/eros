/** Enter the dedicated Eros project directory before CLI imports snapshot cwd. */
const launchCwd = process.env.EROS_LAUNCH_CWD;
if (launchCwd) {
	delete process.env.EROS_LAUNCH_CWD;
	try {
		process.chdir(launchCwd);
	} catch {}
}
