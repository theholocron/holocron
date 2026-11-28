import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** The state of a commit status. */
export type CommitStatusState = "error" | "failure" | "pending" | "success";

/** One commit status as GitHub returns it, with only the fields this client reads. */
export interface GitHubCommitStatus {
	/** The status's numeric id. */
	id: number;
	/** The context that posted it, such as `codecov/patch`. */
	context: string;
	/** Where the context stands. */
	state: CommitStatusState;
	/** The link the status points to, `null` when it set none. */
	target_url: string | null;
	/** When the status was created, an ISO time. */
	created_at: string;
}

/** Page size and the most pages {@link statuses}`.listCommitStatuses` reads: 100 a page over 10 pages. */
const STATUS_PAGE_SIZE = 100;
const STATUS_MAX_PAGES = 10;

export function statuses(rest: RestClient) {
	return {
		/**
		 * Every commit status on a ref, newest first (`GET /commits/{ref}/statuses`), read a page at a time until a page comes
		 * back short. A context that posted more than once appears once per post: the first one is the current state.
		 */
		listCommitStatuses: async (repo: string, ref: string): Promise<GitHubCommitStatus[]> => {
			const all: GitHubCommitStatus[] = [];
			for (let page = 1; page <= STATUS_MAX_PAGES; page++) {
				const batch = await rest.request<GitHubCommitStatus[]>(
					`${repoBase(repo)}/commits/${ref}/statuses?per_page=${STATUS_PAGE_SIZE}&page=${page}`
				);
				all.push(...batch);
				if (batch.length < STATUS_PAGE_SIZE) break;
			}
			return all;
		},
	};
}
