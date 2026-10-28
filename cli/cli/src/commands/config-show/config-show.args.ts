import type { Argv } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";

export interface ConfigShowArgs extends GlobalArgs {
	depth?: number;
	interactive?: boolean;
}

export const configShowArgs = (y: Argv<GlobalArgs>): Argv<ConfigShowArgs> =>
	y
		.option("depth", {
			type: "number",
			describe: "Collapse objects/arrays nested deeper than N levels (TTY output only)",
		})
		.option("interactive", {
			type: "boolean",
			describe: "Browse the config in a foldable tree (default on a TTY; --no-interactive for static output)",
		});
