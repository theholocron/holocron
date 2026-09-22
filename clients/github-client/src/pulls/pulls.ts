import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubPullRequest {
	number: number;
	title: string;
	state: "open" | "closed";
	merged_at: string | null;
	html_url: string;
	head: { ref: string };
}

/** One commit as returned by `GET /pulls/{pull_number}/commits` — only the fields any known consumer needs. */
export interface GitHubPullRequestCommit {
	sha: string;
	commit: { message: string };
}

export function pulls(rest: RestClient) {
	return {
		getPullRequest: (repo: string, number: number): Promise<GitHubPullRequest> =>
			rest.request<GitHubPullRequest>(`${repoBase(repo)}/pulls/${number}`),

		/**
		 * A PR's own commits, in commit order. `per_page=100` — GitHub's max —
		 * covers every real PR in this org; a PR genuinely exceeding 100
		 * commits (GitHub caps this endpoint at 250 regardless of pagination)
		 * is an edge case no consumer here needs to paginate for today.
		 */
		listCommits: (repo: string, number: number): Promise<GitHubPullRequestCommit[]> =>
			rest.request<GitHubPullRequestCommit[]>(`${repoBase(repo)}/pulls/${number}/commits?per_page=100`),
	};
}
