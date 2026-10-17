import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import type { ValidateConfigResult } from "../../../utils/index.js";

export interface PostPrConfigValidationCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	/** `validateConfig()`'s result against the PR's own head ref, not the default branch. */
	result: ValidateConfigResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostPrConfigValidationCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
