import type { RestClient } from "../utils.js";

/**
 * A custom (internal) integration. `clientSecret` is returned only to a caller whose token holds every scope the
 * integration has, so it is absent for a token with fewer. It signs the webhooks Sentry sends to `webhookUrl`.
 */
export interface SentryApp {
	name: string;
	slug: string;
	uuid: string;
	status: string;
	scopes: string[];
	webhookUrl: string | null;
	isAlertable: boolean;
	clientId?: string;
	clientSecret?: string;
}

export interface SentryAppInput {
	name: string;
	/** What the integration may read or write, e.g. `event:read`. The token making the call must hold each. */
	scopes: string[];
	webhookUrl?: string | null;
	/** Offer the integration as an action in alert rules. */
	isAlertable?: boolean;
}

/** An integration installed on the organization. For an internal one this happens when it is created. */
export interface SentryAppInstallation {
	uuid: string;
	status: string;
	app: { uuid: string; slug: string; sentryAppId: number };
}

const seg = encodeURIComponent;

export function sentryApps(rest: RestClient) {
	return {
		/** The custom integrations an organization has made. */
		list: (org: string): Promise<SentryApp[]> =>
			rest.request<SentryApp[]>(`/organizations/${seg(org)}/sentry-apps/`),

		/** One integration by slug or id. */
		get: (slug: string): Promise<SentryApp> => rest.request<SentryApp>(`/sentry-apps/${seg(slug)}/`),

		/** Create an internal integration. It is installed on the organization at once. */
		create: (org: string, input: SentryAppInput): Promise<SentryApp> =>
			rest.request<SentryApp>("/sentry-apps/", {
				method: "POST",
				body: {
					name: input.name,
					organization: org,
					scopes: input.scopes,
					isInternal: true,
					isAlertable: input.isAlertable ?? false,
					webhookUrl: input.webhookUrl ?? null,
					events: [],
					schema: {},
					verifyInstall: false,
				},
			}),

		/**
		 * Update an integration (Sentry requires `name` and `scopes` on every update, and may reset a setting a PUT leaves
		 * out). A setting not given keeps its current value: it is read first, only when one is missing.
		 */
		update: async (slug: string, input: SentryAppInput): Promise<SentryApp> => {
			const current =
				input.isAlertable === undefined || input.webhookUrl === undefined
					? await rest.request<SentryApp>(`/sentry-apps/${seg(slug)}/`)
					: undefined;
			return rest.request<SentryApp>(`/sentry-apps/${seg(slug)}/`, {
				method: "PUT",
				body: {
					name: input.name,
					scopes: input.scopes,
					isInternal: true,
					isAlertable: input.isAlertable ?? current?.isAlertable ?? false,
					webhookUrl: input.webhookUrl !== undefined ? input.webhookUrl : (current?.webhookUrl ?? null),
				},
			});
		},

		/** The integrations installed on an organization, with the numeric app id that alert actions point at. */
		installations: (org: string): Promise<SentryAppInstallation[]> =>
			rest.request<SentryAppInstallation[]>(`/organizations/${seg(org)}/sentry-app-installations/`),
	};
}
