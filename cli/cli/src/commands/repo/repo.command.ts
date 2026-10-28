import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { setupCommand } from "../setup/setup.command.js";
import { repoSyncCommand } from "./repo-sync.command.js";
import { repoUpgradeCommand } from "./repo-upgrade.command.js";

export const repoCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "repo",
	describe: "Set up, sync and upgrade the current repo",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(setupCommand as never)
			.command(repoSyncCommand as never)
			.command(repoUpgradeCommand as never)
			.command(groupMenu("repo") as never),
	handler: () => {},
};
