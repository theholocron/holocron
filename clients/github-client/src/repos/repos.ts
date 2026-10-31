import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubRepo {
	default_branch: string;
	full_name: string;
	description?: string | null;
	homepage?: string | null;
	topics?: string[];
	allow_squash_merge?: boolean;
	allow_merge_commit?: boolean;
	allow_rebase_merge?: boolean;
	allow_auto_merge?: boolean;
	allow_update_branch?: boolean;
	delete_branch_on_merge?: boolean;
	has_issues?: boolean;
	has_discussions?: boolean;
	has_projects?: boolean;
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
