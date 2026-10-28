import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { syncGithubCommand } from "../sync-github/sync-github.command.js";

export const syncCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "sync",
	describe: "Sync generated files to other repos",
	builder: (y: Argv<GlobalArgs>) => y.command(syncGithubCommand as never).command(groupMenu("sync") as never),
	handler: () => {},
};
