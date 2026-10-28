import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { authCheckCommand } from "./auth-check.command.js";
import { authListCommand } from "./auth-list.command.js";
import { authSetCommand } from "./auth-set.command.js";
import { authUnsetCommand } from "./auth-unset.command.js";

export const authCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "auth <subcommand>",
	describe: "Manage bootstrap credentials in the OS keyring",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(authSetCommand as never)
			.command(authUnsetCommand as never)
			.command(authCheckCommand as never)
			.command(authListCommand as never)
			.command(groupMenu("auth") as never),
	handler: () => {},
};
