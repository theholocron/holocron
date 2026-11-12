import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { secretsSyncCommand } from "../secrets-sync/secrets-sync.command.js";

export const secretsCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "secrets",
	describe: "List and set secrets, and sync vault environments",
	builder: (y: Argv<GlobalArgs>) => y.command(secretsSyncCommand as never).command(groupMenu("secrets") as never),
	handler: () => {},
};
