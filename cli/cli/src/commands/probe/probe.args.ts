import type { Argv } from "yargs";

import type { GlobalArgs } from "../../cli-support/index.js";

export interface ProbeArgs extends GlobalArgs {
	provider?: string;
	probe?: string;
	args?: string[];
	yes: boolean;
}

export const probeArgs = (y: Argv<GlobalArgs>): Argv<ProbeArgs> =>
	y
		.positional("provider", {
			type: "string",
			describe: "Which provider's probes (omit to list them all)",
		})
		.positional("probe", {
			type: "string",
			describe: "Which probe to run (omit to list the provider's)",
		})
		.positional("args", {
			type: "string",
			array: true,
			describe: "Arguments for the probe (`probe deps who <name>`)",
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "Run a probe that changes things without asking first (required without a terminal)",
		});
