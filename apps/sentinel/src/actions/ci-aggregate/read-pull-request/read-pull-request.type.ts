import type { GitHubClient } from "@theholocron/github-client";

/** A pull request as the GitHub client returns it. */
export type AggregatePullRequest = Awaited<ReturnType<GitHubClient["pulls"]["getPullRequest"]>>;

/** What {@link readPullRequest} needs. */
export interface ReadPullRequestInput {
	/** The installation client of the repository. */
	client: GitHubClient;
	/** `owner/repo`. */
	repo: string;
	/** The pull request's number. */
	number: number;
	/** The commit the delivery is about; a cached read is reused only when it is still this commit's pull request. */
	sha?: string;
	/** Epoch milliseconds; now when left out. */
	now?: number;
	/** The cache, for tests; one per process by default. */
	cache?: Map<string, { at: number; value: AggregatePullRequest }>;
}
