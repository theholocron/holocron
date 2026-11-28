import type { RestClient } from "../utils.js";

/** Netlify site — the subset of fields consumers read/write. */
export interface NetlifySite {
	/** The site's id. */
	id: string;
	/** The site's name. */
	name: string;
	/** The site's URL. */
	url: string;
	/** The site's HTTPS URL. */
	ssl_url: string;
	/** The URL of the site's page in the Netlify admin UI. */
	admin_url: string;
	/** The id of the account that owns the site. */
	account_id: string;
	/** The slug of the account that owns the site. */
	account_slug?: string;
	/** The site's custom domain, or `null` when none is set. */
	custom_domain?: string | null;
}

/** What to send to Netlify to create a site. */
export interface NetlifyCreateSiteInput {
	/** The site's name. */
	name: string;
	/** A custom domain to set on the site. */
	custom_domain?: string;
}

/** What to send to Netlify to update a site. */
export interface NetlifyUpdateSiteInput {
	/** The custom domain to set. */
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
