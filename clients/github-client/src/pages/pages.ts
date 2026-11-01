import { ProviderApiError } from "@theholocron/http-client";

import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** How a Pages site is built: by a workflow or from a branch. */
export type PagesBuildType = "workflow" | "legacy";

/** The status of a Pages build. */
export type PagesBuildStatus = "built" | "building" | "errored" | "unknown";

/** A repository's GitHub Pages site configuration. */
export interface GitHubPages {
	/** The latest build's status, or `null` when there is none. */
	status: PagesBuildStatus | null;
	/** How the site is built, or `null` when unknown. */
	build_type: PagesBuildType | null;
	/** The branch and folder the site is published from, for a legacy build. */
	source?: {
		/** The branch the site is published from. */
		branch: string;
		/** The folder on the branch, `/` or `/docs`. */
		path: string;
	};
	/** Whether HTTPS is enforced for the site. */
	https_enforced: boolean;
	/** The site's custom domain, or `null` when it has none. */
	custom_domain: string | null;
}

/** The body of a Pages creation request. */
export interface CreatePagesPayload {
	/** How the site is built. */
	build_type: PagesBuildType;
	/** Required when build_type is "legacy". */
	source?: {
		/** The branch the site is published from. */
		branch: string;
		/** The folder on the branch, `/` or `/docs`. */
		path: string;
	};
}

/** The body of a Pages update request; every field is optional. */
export interface UpdatePagesPayload {
	/** How the site is built. */
	build_type?: PagesBuildType;
	/** The branch and folder to publish from. */
	source?: {
		/** The branch the site is published from. */
		branch: string;
		/** The folder on the branch, `/` or `/docs`. */
		path: string;
	};
	/** The custom domain, or `null` to remove it. */
	cname?: string | null;
	/** Whether to enforce HTTPS. */
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
