import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const repoCleanupBranchesArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("local", {
			type: "boolean",
			describe: "Only the branches in this checkout (with neither --local nor --remote: both)",
		})
		.option("remote", {
			type: "boolean",
			describe: "Only the branches on the remote (with neither --local nor --remote: both)",
		})
		.option("yes", {
			type: "boolean",
			describe: "Delete every branch proven merged without asking. Without it a checklist asks.",
		})
		.option("repo", {
			type: "string",
			describe:
				'Repo coords ("owner/name") to look branches and pull requests up in. Defaults to plugin-specific resolution.',
		});

export type RepoCleanupBranchesArgs = InferArgs<typeof repoCleanupBranchesArgs>;
