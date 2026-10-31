import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** A deployment environment of a repository and its protection settings. */
export interface GitHubEnvironment {
	/** The environment's name. */
	name: string;
	/** Minutes to wait before a job that targets the environment may proceed. */
	wait_timer?: number;
	/** Whether the user who triggered a deployment may also approve it. */
	prevent_self_review?: boolean;
	/** The protection rules on the environment; each has a `type` and, for required reviewers, the reviewers. */
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
				.request<EnvironmentsListResponse>(`${repoBase(repo)}/environments`)
				.then((r: EnvironmentsListResponse) => r.environments),

		upsertEnvironment: (repo: string, name: string, body: Record<string, unknown>): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/environments/${encodeURIComponent(name)}`, {
				method: "PUT",
				body,
			}),

		deleteEnvironment: (repo: string, name: string): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/environments/${encodeURIComponent(name)}`, {
				method: "DELETE",
				expectNoContent: true,
			}),
	};
}
