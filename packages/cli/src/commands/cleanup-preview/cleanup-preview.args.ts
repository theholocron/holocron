import type { Argv } from "yargs";

import type { InferArgs } from "../../cli-support/index.js";
import type { DeployArgs } from "../deploy/deploy.args.js";

export const cleanupPreviewArgs = (y: Argv<DeployArgs>) =>
	y
		.positional("pr", {
			type: "number",
			describe: "PR number to clean up",
		})
		.option("project", {
			type: "string",
			demandOption: true,
			describe: "Cloudflare Pages project name (e.g. theholocron-preview)",
		})
		.option("repo", {
			type: "string",
			describe: "GitHub repo as owner/name — defaults to the repo in holocron.config",
		});

export type CleanupPreviewArgs = InferArgs<typeof cleanupPreviewArgs>;
