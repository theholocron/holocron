import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** One branch as `GET /branches` returns it: its name and the commit it points at. */
export interface GitHubBranch {
	name: string;
	commit: { sha: string };
}

/** Page size and the most pages {@link branches}`.listBranches` reads: 100 a page (GitHub's maximum) over 100 pages. */
const BRANCH_PAGE_SIZE = 100;
const BRANCH_MAX_PAGES = 100;

export function branches(rest: RestClient) {
	return {
		protectBranch: (repo: string, branch: string, payload: Record<string, unknown>): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/branches/${encodeURIComponent(branch)}/protection`, {
				method: "PUT",
				body: payload,
			}),

		/** Every branch, read a page at a time until a page comes back short. */
		listBranches: async (repo: string): Promise<GitHubBranch[]> => {
			const all: GitHubBranch[] = [];
			for (let page = 1; page <= BRANCH_MAX_PAGES; page++) {
				const batch = await rest.request<GitHubBranch[]>(
					`${repoBase(repo)}/branches?per_page=${BRANCH_PAGE_SIZE}&page=${page}`
				);
				all.push(...batch);
				if (batch.length < BRANCH_PAGE_SIZE) break;
			}
			return all;
		},

		/** Delete one branch's ref. The name keeps its `/`s; each segment is encoded. */
		removeBranch: (repo: string, branch: string): Promise<void> =>
			rest.request<void>(
				`${repoBase(repo)}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
				{ method: "DELETE" }
			),
	};
}
