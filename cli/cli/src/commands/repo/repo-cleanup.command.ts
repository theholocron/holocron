import type { Argv, CommandModule } from "yargs";

import { type GlobalArgs, groupMenu } from "../../cli-support/index.js";
import { repoCleanupBranchesCommand } from "../repo-cleanup-branches/repo-cleanup-branches.command.js";

export const repoCleanupCommand: CommandModule<GlobalArgs, GlobalArgs> = {
	command: "cleanup",
	describe: "Clean up what a repo accumulates (local branches)",
	builder: (y: Argv<GlobalArgs>) =>
		y.command(repoCleanupBranchesCommand as never).command(groupMenu("repo cleanup") as never),
	handler: () => {},
};
