import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const deployArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("branch", {
			type: "string",
			describe: "Git branch to deploy (omit when using --files)",
		})
		// Not `demandOption`: yargs would make every nested subcommand
		// (`deploy on-release`, `deploy cleanup-preview`) inherit it. The
		// handler below enforces it for the trigger itself.
		.option("project-id", {
			type: "string",
			describe: "Deployment project id (required to trigger a deployment, e.g. Vercel prj_*)",
		})
		.option("target", {
			type: "string",
			choices: ["production", "staging"] as const,
			describe: "Named environment to deploy into. Omit for a branch preview.",
		})
		.option("files", {
			type: "string",
			describe:
				"Deploy from a local directory of source files instead of a Git branch — calls deployFunction(), no linked repo required. Conflicts with `branch`.",
		})
		.conflicts("files", "branch");

export type DeployArgs = InferArgs<typeof deployArgs>;
