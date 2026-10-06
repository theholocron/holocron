import type { RestClient } from "../utils.js";

/** Netlify site — the subset of fields consumers read/write. */
export interface NetlifySite {
	id: string;
	name: string;
	url: string;
	ssl_url: string;
	admin_url: string;
	account_id: string;
	account_slug?: string;
	custom_domain?: string | null;
}

export interface NetlifyCreateSiteInput {
	name: string;
	custom_domain?: string;
}

export interface NetlifyUpdateSiteInput {
	custom_domain?: string;
}

export function sites(rest: RestClient) {
	return {
		list: (): Promise<NetlifySite[]> => rest.request<NetlifySite[]>("/sites"),

		get: (siteId: string): Promise<NetlifySite> =>
			rest.request<NetlifySite>(`/sites/${encodeURIComponent(siteId)}`),

		/** Scoped to `/{account_slug}/sites` — Netlify has no account-id-based create path. */
		create: (accountSlug: string, input: NetlifyCreateSiteInput): Promise<NetlifySite> =>
			rest.request<NetlifySite>(`/${encodeURIComponent(accountSlug)}/sites`, {
				method: "POST",
				body: input,
			}),

		update: (siteId: string, input: NetlifyUpdateSiteInput): Promise<NetlifySite> =>
			rest.request<NetlifySite>(`/sites/${encodeURIComponent(siteId)}`, {
				method: "PATCH",
				body: input,
			}),

		/** Triggers a new build from the latest commit on a git-linked site's default branch. */
		triggerBuild: (siteId: string): Promise<{ deploy_id?: string }> =>
			rest.request<{ deploy_id?: string }>(`/sites/${encodeURIComponent(siteId)}/builds`, {
				method: "POST",
				body: { clear_cache: false },
			}),
	};
}
