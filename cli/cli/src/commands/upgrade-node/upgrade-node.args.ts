import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const upgradeNodeArgs = (yy: Argv<GlobalArgs>) =>
	yy
		.positional("to", {
			type: "number",
			describe: "Target Node.js major version (e.g., 22)",
		})
		.option("from", {
			type: "number",
			describe: "Current major version to replace. Auto-detected from .nvmrc / engines.node when omitted.",
		});

export type UpgradeNodeArgs = InferArgs<typeof upgradeNodeArgs>;
