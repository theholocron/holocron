import { type CheckRunConclusion, type GitHubClient } from "@theholocron/github-client";

import type { ValidateAdrsResult } from "../validate-adrs/index.js";

export interface PostAdrsCheckInput {
	client: Pick<GitHubClient, "checks" | "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: ValidateAdrsResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in `output.text` so a viewer can find the request in Axiom. */
	runId: string;
}

export interface PostAdrsCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
