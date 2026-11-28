import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const monitoringRunResolvedArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("url", {
			type: "string",
			describe: "URL to run every resolved check against",
		})
		.option("checks-file", {
			type: "string",
			demandOption: true,
			describe: "File path to read the resolved checks from (written by `resolve checks`)",
		})
		.option("vercel-project", {
			type: "string",
			describe:
				"Expected Vercel project id/name `url` must resolve to before the Deployment Protection bypass header (VERCEL_PROTECTION_BYPASS_SECRET) is attached. Omitted → the header is never attached.",
		});

export type MonitoringRunResolvedArgs = InferArgs<typeof monitoringRunResolvedArgs>;
