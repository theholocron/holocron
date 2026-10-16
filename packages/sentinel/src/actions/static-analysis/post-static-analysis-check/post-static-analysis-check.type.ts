import { type CheckRunConclusion, type GitHubClient } from "@theholocron/github-client";

import type { LintStaticAnalysisResult } from "../lint-static-analysis/index.js";

export interface PostStaticAnalysisCheckInput {
	client: Pick<GitHubClient, "checks" | "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintStaticAnalysisResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostStaticAnalysisCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
