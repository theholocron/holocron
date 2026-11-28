import type { GitHubClient } from "@theholocron/github-client";

export interface ReadClosingIssuesInput {
	client: Pick<GitHubClient, "graphql">;
	/** `owner/repo` of the pull request. */
	repo: string;
	number: number;
}

/** What a pull request closes, as GitHub says now. */
export interface ClosingIssues {
	/** The issues the pull request closes (the ones `closingIssuesReferences` lists), as `owner/repo` and number. */
	issues: { repo: string; number: number }[];
}
