import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { secretSetCommand } from "../secret-set/secret-set.command.js";
import { secretsListCommand } from "../secrets-list/secrets-list.command.js";
import { secretsSyncCommand } from "../secrets-sync/secrets-sync.command.js";

export const secretsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "secrets",
	describe: "List and set secrets, and sync vault environments",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(secretSetCommand as never)
			.command(secretsListCommand as never)
			.command(secretsSyncCommand as never)
			.command(groupMenu("secrets") as never),
	handler: () => {},
};
