import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import type { LintDcoResult } from "../lint-dco/index.js";

export interface PostDcoCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintDcoResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
	/** The PR's own branch name (`pull_request.head.ref`) — used only in the remediation guidance's force-push command. */
	headRef?: string;
}

export interface PostDcoCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
