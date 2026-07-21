import type { RestClient } from "../utils.js";

export type TeamPermission = "pull" | "triage" | "push" | "maintain" | "admin";

export function teams(rest: RestClient) {
	return {
		addRepo: (
			org: string,
			teamSlug: string,
			owner: string,
			repo: string,
			permission: TeamPermission,
		): Promise<void> =>
			rest.request<void>(
				`/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`,
				{
					method: "PUT",
					body: { permission },
				},
			),
	};
}
