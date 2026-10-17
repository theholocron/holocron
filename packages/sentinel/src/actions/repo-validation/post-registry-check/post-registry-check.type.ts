import { type CheckRunConclusion, type GitHubClient } from "@theholocron/github-client";

import type { ValidateRegistryResult } from "../validate-registry/index.js";

export interface PostRegistryCheckInput {
	client: Pick<GitHubClient, "checks" | "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: ValidateRegistryResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in `output.text` so a viewer can find the request in Axiom. */
	runId: string;
}

export interface PostRegistryCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
