import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const upgradeDepsArgs = (yy: Argv<GlobalArgs>) =>
	yy.option("pins-only", {
		type: "boolean",
		default: false,
		describe: "Only bump the catalog pins — skip the holocron.config.ts migration",
	});

export type UpgradeDepsArgs = InferArgs<typeof upgradeDepsArgs>;
