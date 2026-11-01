import type { RestClient } from "../utils.js";

/**
 * A custom (internal) integration. `clientSecret` is returned only to a caller whose token holds every scope the
 * integration has, so it is absent for a token with fewer. It signs the webhooks Sentry sends to `webhookUrl`.
 */
export interface SentryApp {
	/** The integration's name. */
	name: string;
	/** The integration's slug. */
	slug: string;
	/** The integration's UUID. */
	uuid: string;
	/** The integration's status as Sentry reports it. */
	status: string;
	/** The scopes the integration holds. */
	scopes: string[];
	/** Where Sentry sends webhooks, or `null` for none. */
	webhookUrl: string | null;
	/** Whether the integration is offered as an action in alert rules. */
	isAlertable: boolean;
	/** The OAuth client id; present only when the token may see it. */
	clientId?: string;
	/** The secret that signs webhooks; present only when the token may see it. */
	clientSecret?: string;
}

/** Input for `sentryApps.create()` and `sentryApps.update()`. */
export interface SentryAppInput {
	/** The integration's name. */
	name: string;
	/** What the integration may read or write, e.g. `event:read`. The token making the call must hold each. */
	scopes: string[];
	/** Where Sentry sends webhooks; `null` or omitted for none. */
	webhookUrl?: string | null;
	/** Offer the integration as an action in alert rules. */
	isAlertable?: boolean;
}

/** An integration installed on the organization. For an internal one this happens when it is created. */
export interface SentryAppInstallation {
	/** The installation's UUID. */
	uuid: string;
	/** The installation's status as Sentry reports it. */
	status: string;
	/** The installed integration. */
	app: {
		/** The integration's UUID. */
		uuid: string;
		/** The integration's slug. */
		slug: string;
		/** The numeric integration id that alert actions point at. */
		sentryAppId: number;
	};
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
