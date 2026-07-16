import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubEnvironment {
	name: string;
	wait_timer?: number;
	prevent_self_review?: boolean;
	protection_rules?: Array<{
		type: string;
		reviewers?: Array<{
			type: "User" | "Team";
			reviewer: { id: number };
		}>;
	}>;
}

interface EnvironmentsListResponse {
	total_count: number;
	environments: GitHubEnvironment[];
}

export function environments(rest: RestClient) {
	return {
		listEnvironments: (repo: string): Promise<GitHubEnvironment[]> =>
			rest
				.request<EnvironmentsListResponse>(
					`${repoBase(repo)}/environments`,
				)
				.then((r: EnvironmentsListResponse) => r.environments),

		upsertEnvironment: (
			repo: string,
			name: string,
			body: Record<string, unknown>,
		): Promise<void> =>
			rest.request<void>(
				`${repoBase(repo)}/environments/${encodeURIComponent(name)}`,
				{
					method: "PUT",
					body,
				},
			),

		deleteEnvironment: (repo: string, name: string): Promise<void> =>
			rest.request<void>(
				`${repoBase(repo)}/environments/${encodeURIComponent(name)}`,
				{
					method: "DELETE",
					expectNoContent: true,
				},
			),
	};
}
