import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const monitoringResolveChecksArgs = (y: Argv<GlobalArgs>) =>
	y.option("out", {
		type: "string",
		demandOption: true,
		describe: "File path to write the resolved checks to",
	});

export type MonitoringResolveChecksArgs = InferArgs<typeof monitoringResolveChecksArgs>;
