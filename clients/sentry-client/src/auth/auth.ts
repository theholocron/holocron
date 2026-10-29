import type { RestClient } from "../utils.js";

export interface SentryOrganization {
	id: string;
	slug: string;
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
