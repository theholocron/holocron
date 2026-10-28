import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const repoSyncArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("steps", {
			type: "string",
			array: true,
			describe:
				"Steps to run: labels, properties, teams, topics, keywords, description, homepage, readme, workflows, scripts, wiki (default: all)",
		})
		.option("repo", {
			type: "string",
			describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
		});

export type RepoSyncArgs = InferArgs<typeof repoSyncArgs>;
