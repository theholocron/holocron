import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

export interface PostCheckRunInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a push event's `after` field, or a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	/** From `syncPropertiesFromConfig()`'s result's `holocron_capabilities`, or independently resolved. */
	capabilities: readonly string[];
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostCheckRunResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}
