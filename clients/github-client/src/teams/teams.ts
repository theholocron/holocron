import type { RestClient } from "../utils.js";
import { segment } from "../utils.js";

export type TeamPermission = "pull" | "triage" | "push" | "maintain" | "admin";

/** A member of a team, as GitHub lists it. `id` is the numeric user id, which survives a rename; `login` does not. */
export interface TeamMember {
	id: number;
	login: string;
	type?: string;
}

const PAGE = 100;
/** A guard so a runaway listing cannot loop forever: 50 pages of 100 is far more than any team. */
const MAX_PAGES = 50;

export function teams(rest: RestClient) {
	return {
		/**
		 * Every member of a team (maintainers included), read page by page. Members of child teams are
		 * included, as GitHub does. A 404 means the team does not exist or the token cannot see it.
		 */
		members: async (org: string, teamSlug: string): Promise<TeamMember[]> => {
			const path = `/orgs/${segment(org)}/teams/${segment(teamSlug)}/members`;
			const read = (page: number) =>
				rest.request<TeamMember[]>(path, { query: { per_page: String(PAGE), page: String(page) } });
			const all: TeamMember[] = [];
			for (let page = 1; page <= MAX_PAGES; page++) {
				const batch = await read(page);
				all.push(...batch);
				if (batch.length < PAGE) return all;
			}
			// Exactly MAX_PAGES full pages: only a further, non-empty page means the team is too big.
			if ((await read(MAX_PAGES + 1)).length > 0) {
				throw new Error(
					`team ${org}/${teamSlug} has more than ${MAX_PAGES * PAGE} members; refusing to read them all`
				);
			}
			return all;
		},
		addRepo: (
			org: string,
			teamSlug: string,
			owner: string,
			repo: string,
			permission: TeamPermission
		): Promise<void> =>
			rest.request<void>(`/orgs/${org}/teams/${teamSlug}/repos/${owner}/${repo}`, {
				method: "PUT",
				body: { permission },
			}),
	};
}
