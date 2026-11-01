import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** A repository label. */
export interface GitHubLabel {
	/** The label's name. */
	name: string;
	/** The label's color as a hex code without the leading `#`. */
	color: string;
	/** The label's description, or `null` when it has none. */
	description: string | null;
}

export function labels(rest: RestClient) {
	return {
		listLabels: (repo: string): Promise<GitHubLabel[]> =>
			rest.request<GitHubLabel[]>(`${repoBase(repo)}/labels?per_page=100`),

		createLabel: (repo: string, body: { name: string; color: string; description: string }): Promise<GitHubLabel> =>
			rest.request<GitHubLabel>(`${repoBase(repo)}/labels`, {
				method: "POST",
				body,
			}),

		updateLabel: (
			repo: string,
			name: string,
			body: { color?: string; description?: string }
		): Promise<GitHubLabel> =>
			rest.request<GitHubLabel>(`${repoBase(repo)}/labels/${encodeURIComponent(name)}`, {
				method: "PATCH",
				body,
			}),

		deleteLabel: (repo: string, name: string): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/labels/${encodeURIComponent(name)}`, {
				method: "DELETE",
			}),
	};
}
