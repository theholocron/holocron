import { type CheckRunConclusion, type GitHubClient } from "@theholocron/github-client";

import type { LintMarkdownResult } from "../lint-markdown/index.js";

export interface PostMarkdownLintCheckInput {
	client: Pick<GitHubClient, "checks" | "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintMarkdownResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostMarkdownLintCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
