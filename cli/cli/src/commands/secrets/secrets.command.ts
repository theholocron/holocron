import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { secretSetCommand } from "../secret-set/secret-set.command.js";
import { secretsSyncCommand } from "../secrets-sync/secrets-sync.command.js";

export const secretsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "secrets",
	describe: "Set secrets and sync vault environments",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(secretSetCommand as never)
			.command(secretsSyncCommand as never)
			.command(groupMenu("secrets") as never),
	handler: () => {},
};
