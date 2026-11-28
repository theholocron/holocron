import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const syncArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("steps", {
			type: "string",
			array: true,
			describe:
				"Steps to run: labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki (default: all); or a workspace app's name with --env",
		})
		.option("env", {
			type: "string",
			array: true,
			// One value per flag, so `--env production sentinel` does not take the app's name for an environment.
			nargs: 1,
			alias: "environment",
			// Not global: `sync secrets` has its own required `--env`, which must not inherit this one.
			global: false,
			describe:
				"Sync a workspace app's secrets by name (`sync <app> --env production`): an environment to write to, `production` or `preview`; repeat the flag for both. From inside the app's folder the name may be left off.",
		})
		.option("repo", {
			type: "string",
			global: false,
			describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
		});

export type SyncArgs = InferArgs<typeof syncArgs>;
