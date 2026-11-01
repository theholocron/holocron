import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const npmBumpVersionsArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("new-version", {
			type: "string",
			describe: "Version to set (e.g., 4.2.0 or 2.0.0-alpha.1)",
		})
		.option("group", {
			type: "string",
			describe:
				"Only this version group's packages: a folder of the repo (clients, observability). " +
				"The root package.json is left alone. Omitted, the root and every workspace package move together.",
		})
		.option("exclude-group", {
			type: "string",
			array: true,
			describe:
				"Leave this version group's packages alone (repeatable). The repo-wide bump uses it so it " +
				"does not move a group that is released on its own.",
		})
		.option("include-private", {
			type: "boolean",
			default: false,
			describe:
				"Bump private packages too, for a group that publishes nothing and only records its version (ci). " +
				"Default: private packages are skipped.",
		});

export type NpmBumpVersionsArgs = InferArgs<typeof npmBumpVersionsArgs>;
