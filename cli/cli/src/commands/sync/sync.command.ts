import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { syncGithubCommand } from "../sync-github/sync-github.command.js";
import { syncIssuesCommand } from "../sync-issues/index.js";

export const syncCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "sync",
	describe: "Sync generated files to other repos, or issues from one tracker to another",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(syncGithubCommand as never)
			.command(syncIssuesCommand as never)
			.command(groupMenu("sync") as never),
	handler: () => {},
};
