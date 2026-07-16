import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubRuleset {
	id: number;
	name: string;
	enforcement: string;
}

export function rulesets(rest: RestClient) {
	return {
		listRulesets: (repo: string): Promise<GitHubRuleset[]> =>
			rest.request<GitHubRuleset[]>(`${repoBase(repo)}/rulesets`),

		createRuleset: (
			repo: string,
			payload: Record<string, unknown>,
		): Promise<GitHubRuleset> =>
			rest.request<GitHubRuleset>(`${repoBase(repo)}/rulesets`, {
				method: "POST",
				body: payload,
			}),

		updateRuleset: (
			repo: string,
			id: number,
			payload: Record<string, unknown>,
		): Promise<GitHubRuleset> =>
			rest.request<GitHubRuleset>(`${repoBase(repo)}/rulesets/${id}`, {
				method: "PUT",
				body: payload,
			}),
	};
}
