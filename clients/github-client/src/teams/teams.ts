import type { RestClient } from "../utils.js";
import { repoBase, segment } from "../utils.js";

/** A permission level a team can hold on a repository. */
export type TeamPermission = "pull" | "triage" | "push" | "maintain" | "admin";

/** A team with access to a repository, and the permission it has there. */
export interface RepoTeam {
	/** The team's slug. */
	slug: string;
	/** The team's permission on the repository. */
	permission: TeamPermission;
}

/** A member of a team, as GitHub lists it. `id` is the numeric user id, which survives a rename; `login` does not. */
export interface TeamMember {
	/** The member's numeric user id. */
	id: number;
	/** The member's login. */
	login: string;
	/** The kind of account, e.g. `User`. */
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
		/** The teams that have access to a repository, with each team's permission there (read-only). */
		listForRepo: (repo: string): Promise<RepoTeam[]> =>
			rest.request<RepoTeam[]>(`${repoBase(repo)}/teams`, { query: { per_page: String(PAGE) } }),
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
