import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const repoCleanupBranchesArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("local", {
			type: "boolean",
			describe:
				"Clean up the branches in this checkout (the only mode so far; required so a later --remote means what it says)",
		})
		.option("yes", {
			type: "boolean",
			describe: "Delete the branches proven merged. Without it the command only lists them.",
		})
		.option("repo", {
			type: "string",
			describe: 'Repo coords ("owner/name") to look pull requests up in. Defaults to plugin-specific resolution.',
		});

export type RepoCleanupBranchesArgs = InferArgs<typeof repoCleanupBranchesArgs>;
