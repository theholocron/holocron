import type { RestClient } from "../utils.js";

/** A Sentry organization. */
export interface SentryOrganization {
	/** The organization id. */
	id: string;
	/** The organization slug used in API paths. */
	slug: string;
	/** The organization's display name. */
	name: string;
}

export function auth(rest: RestClient) {
	return {
		/** List all organizations accessible with the current token. */
		organizations: (): Promise<SentryOrganization[]> => rest.request<SentryOrganization[]>("/organizations/"),

		/** Get a single organization by slug. */
		getOrg: (org: string): Promise<SentryOrganization> =>
			rest.request<SentryOrganization>(`/organizations/${org}/`),
	};
}
