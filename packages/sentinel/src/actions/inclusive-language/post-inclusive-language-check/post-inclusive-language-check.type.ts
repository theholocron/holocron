import { type CheckRunConclusion, type GitHubClient } from "@theholocron/github-client";

import type { LintInclusiveLanguageResult } from "../lint-inclusive-language/index.js";

export interface PostInclusiveLanguageCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintInclusiveLanguageResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostInclusiveLanguageCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
