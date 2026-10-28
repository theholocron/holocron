import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const setupArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("repo", {
			type: "string",
			describe: 'Repo coords ("owner/name"). Defaults to plugin-specific resolution.',
		})
		.option("hooks", {
			type: "boolean",
			describe:
				"Install git hooks (.husky/pre-push → holocron run ci). Default: on for protection:'strict'. --no-hooks to skip.",
		});

export type SetupArgs = InferArgs<typeof setupArgs>;
