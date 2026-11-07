import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { repoPropertiesCommand } from "../repo-properties/index.js";
import { setupCommand } from "../setup/setup.command.js";
import { repoCleanupCommand } from "./repo-cleanup.command.js";
import { repoSyncCommand } from "./repo-sync.command.js";
import { repoUpgradeCommand } from "./repo-upgrade.command.js";

export const repoCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "repo",
	describe: "Set up, sync, upgrade and clean up the current repo",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(setupCommand as never)
			.command(repoSyncCommand as never)
			.command(repoUpgradeCommand as never)
			.command(repoCleanupCommand as never)
			.command(repoPropertiesCommand as never)
			.command(groupMenu("repo") as never),
	handler: () => {},
};
