import { ProviderApiError } from "@theholocron/http-client";

import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export type PagesBuildType = "workflow" | "legacy";

export interface GitHubPages {
	status: "built" | "building" | "errored" | "unknown" | null;
	build_type: PagesBuildType | null;
	source?: { branch: string; path: string };
	https_enforced: boolean;
	custom_domain: string | null;
}

export interface CreatePagesPayload {
	build_type: PagesBuildType;
	/** Required when build_type is "legacy". */
	source?: { branch: string; path: string };
}

export interface UpdatePagesPayload {
	build_type?: PagesBuildType;
	source?: { branch: string; path: string };
	cname?: string | null;
	https_enforced?: boolean;
}

export function pages(rest: RestClient) {
	return {
		/** Returns null when Pages is not yet enabled (404). */
		getPages: async (repo: string): Promise<GitHubPages | null> => {
			try {
				return await rest.request<GitHubPages>(`${repoBase(repo)}/pages`);
			} catch (err) {
				if (err instanceof ProviderApiError && err.status === 404) return null;
				throw err;
			}
		},

		/**
		 * Enables Pages for the first time.
		 * Throws on all errors except 409 Conflict (already enabled — callers
		 * should catch that and fall through to updatePages).
		 */
		createPages: (repo: string, payload: CreatePagesPayload): Promise<GitHubPages> =>
			rest.request<GitHubPages>(`${repoBase(repo)}/pages`, {
				method: "POST",
				body: payload,
			}),

		/**
		 * Updates Pages settings on an existing site (build type, cname, https).
		 * GitHub returns 204 No Content.
		 */
		updatePages: (repo: string, payload: UpdatePagesPayload): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/pages`, {
				method: "PUT",
				body: payload,
			}),
	};
}
