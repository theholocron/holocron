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

export function pulls(rest: RestClient) {
	return {
		getPullRequest: (repo: string, number: number): Promise<GitHubPullRequest> =>
			rest.request<GitHubPullRequest>(`${repoBase(repo)}/pulls/${number}`),
	};
}
