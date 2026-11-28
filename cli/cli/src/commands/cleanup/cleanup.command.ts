import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs } from "../global-args/index.js";
import { groupMenu } from "../group-menu/index.js";
import { notificationsDedupeCommand } from "../notifications-dedupe/notifications-dedupe.command.js";
import { repoCleanupBranchesCommand } from "../repo-cleanup-branches/repo-cleanup-branches.command.js";

export const cleanupCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "cleanup",
	describe: "Clean up what a repo or a forum accumulates (merged branches, duplicate posts)",
	builder: (y: Argv<GlobalArgs>) =>
		y
			.command(repoCleanupBranchesCommand as never)
			.command(notificationsDedupeCommand as never)
			.command(groupMenu("cleanup") as never),
	handler: () => {},
};
