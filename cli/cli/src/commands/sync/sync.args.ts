import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const syncArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("steps", {
			type: "string",
			array: true,
			describe:
				"Steps to run: labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki (default: all)",
		})
		.option("repo", {
			type: "string",
			global: false,
			describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
		});

export type SyncArgs = InferArgs<typeof syncArgs>;
