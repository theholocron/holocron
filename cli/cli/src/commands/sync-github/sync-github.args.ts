import type { Argv } from "yargs";

import type { GlobalArgs, InferArgs } from "../../cli-support/index.js";

export const syncGithubArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("repo", {
			type: "string",
			default: "theholocron/.github",
			describe: "Target org/repo (default: theholocron/.github)",
		})
		.option("branch", {
			type: "string",
			describe:
				"Push to this branch instead of the default branch (enables PR-based workflow for protected repos)",
		})
		.option("pr", {
			type: "boolean",
			default: false,
			describe: "Open a PR after pushing to --branch (no-op without --branch)",
		})
		.option("message", {
			type: "string",
			describe: "Commit message (default: chore: sync from theholocron/holocron)",
		})
		.option("output-dir", {
			type: "string",
			describe: "Write generated files to this local directory instead of pushing (for validation)",
		});

export type SyncGithubArgs = InferArgs<typeof syncGithubArgs>;
