import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const cloneArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("target", {
			type: "string",
			describe: "org/repo to clone, or a bare org to clone every repo in it (confirms first).",
		})
		.option("dir", {
			type: "string",
			describe: "Parent directory to clone into (default: ~/Code/<org>)",
		});

export type CloneArgs = InferArgs<typeof cloneArgs>;
