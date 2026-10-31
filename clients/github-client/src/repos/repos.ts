import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubRepo {
	default_branch: string;
	full_name: string;
	/** The repository description. */
	description?: string | null;
	/** The repository homepage URL. */
	homepage?: string | null;
	/** The topics set on the repository. */
	topics?: string[];
	/** Whether squash merging is allowed. */
	allow_squash_merge?: boolean;
	/** Whether merge commits are allowed. */
	allow_merge_commit?: boolean;
	/** Whether rebase merging is allowed. */
	allow_rebase_merge?: boolean;
	/** Whether auto-merge is allowed. */
	allow_auto_merge?: boolean;
	/** Whether a pull request branch can be updated from its base. */
	allow_update_branch?: boolean;
	/** Whether a merged pull request's branch is deleted. */
	delete_branch_on_merge?: boolean;
	/** Whether issues are enabled. */
	has_issues?: boolean;
	/** Whether discussions are enabled. */
	has_discussions?: boolean;
	/** Whether projects are enabled. */
	has_projects?: boolean;
	/** Whether the wiki is enabled. */
	has_wiki?: boolean;
	/** Each feature's `status` (`enabled` / `disabled`). Only an admin token sees it; absent for the rest. */
	security_and_analysis?: Record<string, { status: string } | undefined> | null;
}

export interface GitHubContents {
	content: string;
	encoding: string;
}

export function repos(rest: RestClient) {
	return {
		getRepo: (repo: string): Promise<GitHubRepo> => rest.request<GitHubRepo>(repoBase(repo)),

		updateRepo: (repo: string, settings: Record<string, unknown>): Promise<void> =>
			rest.request<void>(repoBase(repo), {
				method: "PATCH",
				body: settings,
			}),

		getContents: (repo: string, path: string): Promise<GitHubContents> =>
			rest.request<GitHubContents>(`${repoBase(repo)}/contents/${path}`),
	};
}
