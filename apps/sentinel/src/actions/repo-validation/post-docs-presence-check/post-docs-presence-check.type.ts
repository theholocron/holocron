import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import type { ValidateDocsPresenceResult } from "../validate-docs-presence/index.js";

export interface PostDocsPresenceCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: ValidateDocsPresenceResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in `output.text` so a viewer can find the request in Axiom. */
	runId: string;
}

export interface PostDocsPresenceCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
