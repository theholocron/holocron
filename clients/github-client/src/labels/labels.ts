import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubLabel {
	name: string;
	color: string;
	description: string | null;
}

export function labels(rest: RestClient) {
	return {
		listLabels: (repo: string): Promise<GitHubLabel[]> =>
			rest.request<GitHubLabel[]>(
				`${repoBase(repo)}/labels?per_page=100`,
			),

		createLabel: (
			repo: string,
			body: { name: string; color: string; description: string },
		): Promise<GitHubLabel> =>
			rest.request<GitHubLabel>(`${repoBase(repo)}/labels`, {
				method: "POST",
				body,
			}),

		updateLabel: (
			repo: string,
			name: string,
			body: { color?: string; description?: string },
		): Promise<GitHubLabel> =>
			rest.request<GitHubLabel>(
				`${repoBase(repo)}/labels/${encodeURIComponent(name)}`,
				{
					method: "PATCH",
					body,
				},
			),

		deleteLabel: (repo: string, name: string): Promise<void> =>
			rest.request<void>(
				`${repoBase(repo)}/labels/${encodeURIComponent(name)}`,
				{
					method: "DELETE",
				},
			),
	};
}
