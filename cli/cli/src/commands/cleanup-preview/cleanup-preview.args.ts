import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

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
		})
		.option("yes", {
			type: "boolean",
			default: false,
			describe:
				"Delete every preview deployment found without asking (for CI). Refuses a pull request that is still open.",
		});

export type CleanupPreviewArgs = InferArgs<typeof cleanupPreviewArgs>;
