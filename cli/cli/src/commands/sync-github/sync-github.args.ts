import { DOT_GITHUB_REPO, HOLOCRON_REPO } from "@theholocron/astromech";
import type { InferArgs } from "@theholocron/kyber/flags";
import type { Argv } from "yargs";

import type { GlobalArgs } from "../global-args/index.js";

export const syncGithubArgs = (y: Argv<GlobalArgs>) =>
	y
		.option("repo", {
			type: "string",
			default: DOT_GITHUB_REPO,
			describe: `Target org/repo (default: ${DOT_GITHUB_REPO})`,
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
			describe: `Commit message (default: chore: sync from ${HOLOCRON_REPO})`,
		})
		.option("output-dir", {
			type: "string",
			describe: "Write generated files to this local directory instead of pushing (for validation)",
		});

export type SyncGithubArgs = InferArgs<typeof syncGithubArgs>;
