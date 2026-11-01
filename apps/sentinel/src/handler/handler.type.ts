export interface Env {
	GITHUB_APP_ID: string;
	GITHUB_APP_PRIVATE_KEY: string;
	SENTINEL_WEBHOOK_SECRET: string;
}

/** The push/pull_request-specific fields the pipeline needs beyond what `SentinelEvent` already normalizes. */
export interface ResolutionContext {
	defaultBranch: string;
	headSha: string;
	/** Only present for `pull_request.*` events — `lintCommits()`'s own input. `push.default-branch` has no PR to fetch commits from. */
	pullNumber?: number;
	/** Only present for `pull_request.*` events — the PR's head *branch name*, not a SHA. `commitFormattingFix()`'s own `updateRef()` input (holocron#820); nothing else needs it. */
	headRef?: string;
	/** Only present for `pull_request.*` events — the PR title, which the docs-presence check reads a `feat` from. */
	prTitle?: string;
	/** Only present for `pull_request.*` events — the PR description, which the docs-presence check reads `[skip docs]` from. */
	prBody?: string;
}
