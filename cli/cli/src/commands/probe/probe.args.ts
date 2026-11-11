import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export interface ProbeArgs extends GlobalArgs {
	provider?: string;
	probe?: string;
	args?: string[];
	lcov?: string;
	warn?: boolean;
	files?: boolean;
	only?: string[];
	copy?: boolean;
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
		.option("lcov", {
			type: "string",
			describe: "Also write the coverage a `docs` probe measures to this lcov file (relative to the repo root)",
		})
		.option("warn", {
			type: "boolean",
			describe: "`tasks names`: report each old task name as an info row instead of failing",
		})
		.option("files", {
			type: "boolean",
			describe:
				"`tasks names`: also report old names that are part of a workflow file name (`delivery.build.yml`)",
		})
		.option("only", {
			type: "string",
			array: true,
			nargs: 1,
			describe: "`1password export-environment`: export only this variable; repeat for more",
		})
		.option("copy", {
			type: "boolean",
			describe: "`1password export-environment`: put the variables on the clipboard instead of a file",
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe: "Run a probe that changes things without asking first (required without a terminal)",
		});
