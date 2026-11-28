import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const deployArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("branch", {
			type: "string",
			describe: "Git branch to deploy, or a workspace app's name with --env (omit when using --files)",
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
		.option("env", {
			type: "string",
			array: true,
			// One value per flag, so `--env production sentinel` does not take the app's name for an environment.
			nargs: 1,
			alias: "environment",
			// Not global: `deploy on-release` and its siblings must not inherit it.
			global: false,
			describe:
				"Deploy a workspace app by name (`deploy <app> --env production`): an environment to deploy to, `production` or `preview`; repeat the flag for both. The app is found under the workspace; from inside its folder the name may be left off.",
		})
		.option("files", {
			type: "string",
			describe:
				"Deploy from a local directory of source files instead of a Git branch — calls deployFunction(), no linked repo required. Conflicts with `branch`.",
		})
		.conflicts("files", "branch");

export type DeployArgs = InferArgs<typeof deployArgs>;
