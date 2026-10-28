import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const monitoringCheckArgs = (y: Argv<GlobalArgs>) =>
	y
		.positional("url", {
			type: "string",
			describe: "URL to test every configured check against (e.g. a PR's preview deployment)",
		})
		.option("vercel-project", {
			type: "string",
			describe:
				"Expected Vercel project id/name `url` must resolve to before the Deployment Protection bypass header (VERCEL_PROTECTION_BYPASS_SECRET) is attached. Omitted → the header is never attached, regardless of that env var.",
		});

export type MonitoringCheckArgs = InferArgs<typeof monitoringCheckArgs>;
