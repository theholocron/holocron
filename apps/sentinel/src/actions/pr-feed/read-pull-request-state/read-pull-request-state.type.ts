import type { GitHubCheckRun, GitHubClient } from "@theholocron/github-client";

import type { PullRequestState } from "../pr-feed.type.js";

export interface ReadPullRequestStateInput {
	client: GitHubClient;
	/** `owner/repo`. */
	repo: string;
	number: number;
	/** What to say the pull request's age is counted from when GitHub gives no creation time. */
	now: Date;
}

/** What the feed knows about a pull request now. */
export interface PullRequestSnapshot {
	state: PullRequestState;
	/** The head commit. */
	headSha: string;
	/** Who merged it, when it is merged. */
	mergedBy?: string;
	diff: { additions: number; deletions: number; changedFiles: number };
	/** Every check run on the head commit. */
	checkRuns: GitHubCheckRun[];
}
