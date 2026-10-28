import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const npmBumpVersionsArgs = (y: Argv<GlobalArgs>) =>
	y.positional("new-version", {
		type: "string",
		describe: "Version to set (e.g., 4.2.0 or 2.0.0-alpha.1)",
	});

export type NpmBumpVersionsArgs = InferArgs<typeof npmBumpVersionsArgs>;
