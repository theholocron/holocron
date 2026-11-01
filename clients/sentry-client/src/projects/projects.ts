import type { RestClient } from "../utils.js";

/** A Sentry project. */
export interface SentryProject {
	/** The project id. */
	id: string;
	/** The project slug used in API paths. */
	slug: string;
	/** The project's display name. */
	name: string;
	/** The platform identifier, or `null` when none is set. */
	platform: string | null;
}

/** The DSN URLs of a client key. */
export interface SentryKeyDsn {
	/** The DSN to give an SDK; it carries only the public key. */
	public: string;
	/** The DSN that includes the secret key. */
	secret: string;
	/** Content Security Policy endpoint. */
	csp: string;
}

/** A client key (DSN) of a project. */
export interface SentryKey {
	/** The key id. */
	id: string;
	/** The key's label. */
	label: string;
	/** The public key. */
	public: string;
	/** The secret key. */
	secret: string;
	/** The DSN URLs built from the key. */
	dsn: SentryKeyDsn;
}

/** Input for `projects.create()`. */
export interface CreateSentryProjectInput {
	/** The project name. */
	name: string;
	/** The platform identifier, e.g. `node`; omitted, none is sent. */
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
