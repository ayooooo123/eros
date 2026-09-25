/**
 * Check for and install updates.
 */

import { APP_COMMAND_NAME } from "@oh-my-pi/pi-utils";
import { Command, Flags } from "@oh-my-pi/pi-utils/cli";
import * as pluginCli from "../cli/plugin-cli";
import * as updateCli from "../cli/update-cli";
import { CliUsageError } from "../cli/usage-error";
import { initTheme } from "@oh-my-pi/pi-tui/theme";

export default class Update extends Command {
	static description = "Update installed plugins; EROS core is source-managed";
	static flags = {
		force: Flags.boolean({ char: "f", description: "Rejected for source-managed EROS", default: false }),
		check: Flags.boolean({ char: "c", description: "Rejected for source-managed EROS", default: false }),
		plugins: Flags.boolean({ char: "l", description: "Update installed plugins", default: false }),
		canary: Flags.boolean({ description: "Rejected for source-managed EROS", default: false }),
		stable: Flags.boolean({ description: "Rejected for source-managed EROS", default: false }),
	};

	static examples = [`${APP_COMMAND_NAME} update --plugins`];

	async run(): Promise<void> {
		const { flags } = await this.parse(Update);
		await initTheme();
		if (flags.canary && flags.stable) throw new CliUsageError("--canary and --stable are mutually exclusive");
		if (flags.plugins) {
			await pluginCli.runPluginCommand({ action: "upgrade", args: [], flags: {} });
		} else {
			throw new CliUsageError(updateCli.SOURCE_MANAGED_UPDATE_MESSAGE);
		}
	}
}
