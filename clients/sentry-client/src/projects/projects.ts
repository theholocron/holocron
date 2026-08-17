import type { RestClient } from "../utils.js";

export interface SentryProject {
	id: string;
	slug: string;
	name: string;
	platform: string | null;
}

export interface SentryKeyDsn {
	public: string;
	secret: string;
}

export interface SentryKey {
	id: string;
	label: string;
	public: string;
	secret: string;
	dsn: SentryKeyDsn;
}

export interface CreateSentryProjectInput {
	name: string;
	platform?: string;
}

export function projects(rest: RestClient) {
	return {
		/** List all projects in an org. */
		list: (org: string): Promise<SentryProject[]> =>
			rest.request<SentryProject[]>(`/organizations/${org}/projects/`),

		/** Get a single project by slug. Throws ProviderApiError 404 if not found. */
		get: (org: string, slug: string): Promise<SentryProject> =>
			rest.request<SentryProject>(`/projects/${org}/${slug}/`),

		/**
		 * Create a project under a team. Returns the new project.
		 * Team slug defaults to org slug when omitted by the caller.
		 */
		create: (org: string, team: string, input: CreateSentryProjectInput): Promise<SentryProject> =>
			rest.request<SentryProject>(`/teams/${org}/${team}/projects/`, {
				method: "POST",
				body: {
					name: input.name,
					...(input.platform ? { platform: input.platform } : {}),
				},
			}),

		/** List client keys (DSNs) for a project. */
		keys: (org: string, slug: string): Promise<SentryKey[]> =>
			rest.request<SentryKey[]>(`/projects/${org}/${slug}/keys/`),
	};
}
