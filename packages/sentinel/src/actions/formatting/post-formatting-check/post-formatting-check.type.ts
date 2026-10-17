import { type CheckRunConclusion, type GitHubClient } from "@theholocron/github-client";

import type { LintFormattingResult } from "../lint-formatting/index.js";

export interface PostFormattingCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintFormattingResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostFormattingCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
