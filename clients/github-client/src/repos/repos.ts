import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubRepo {
	default_branch: string;
	full_name: string;
}

export interface GitHubContents {
	content: string;
	encoding: string;
}

export function repos(rest: RestClient) {
	return {
		getRepo: (repo: string): Promise<GitHubRepo> =>
			rest.request<GitHubRepo>(repoBase(repo)),

		updateRepo: (
			repo: string,
			settings: Record<string, unknown>,
		): Promise<void> =>
			rest.request<void>(repoBase(repo), {
				method: "PATCH",
				body: settings,
			}),

		getContents: (repo: string, path: string): Promise<GitHubContents> =>
			rest.request<GitHubContents>(`${repoBase(repo)}/contents/${path}`),
	};
}
