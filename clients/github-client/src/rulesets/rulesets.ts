import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** A repository ruleset in summary form. */
export interface GitHubRuleset {
	/** The ruleset's numeric id. */
	id: number;
	/** The ruleset's name. */
	name: string;
	/** How the ruleset is enforced, e.g. `active`, `evaluate` or `disabled`. */
	enforcement: string;
}

/** One ruleset in full, as `GET /repos/{repo}/rulesets/{id}` returns it. */
export interface GitHubRulesetDetail extends GitHubRuleset {
	/** What the ruleset applies to, e.g. `branch`. */
	target?: string;
	/** Each rule has a `type`; some carry `parameters`. */
	rules?: Array<{ type: string; parameters?: Record<string, unknown> }>;
}

export function rulesets(rest: RestClient) {
	return {
		getRuleset: (repo: string, id: number): Promise<GitHubRulesetDetail> =>
			rest.request<GitHubRulesetDetail>(`${repoBase(repo)}/rulesets/${id}`),

		listRulesets: (repo: string): Promise<GitHubRuleset[]> =>
			rest.request<GitHubRuleset[]>(`${repoBase(repo)}/rulesets`),

		createRuleset: (repo: string, payload: Record<string, unknown>): Promise<GitHubRuleset> =>
			rest.request<GitHubRuleset>(`${repoBase(repo)}/rulesets`, {
				method: "POST",
				body: payload,
			}),

		updateRuleset: (repo: string, id: number, payload: Record<string, unknown>): Promise<GitHubRuleset> =>
			rest.request<GitHubRuleset>(`${repoBase(repo)}/rulesets/${id}`, {
				method: "PUT",
				body: payload,
			}),
	};
}
