import { cfRequest, type RestClient } from "../utils.js";

/** A notification webhook destination. Cloudflare never returns its secret. */
export interface CfWebhookDestination {
	/** The destination's identifier (a UUID). */
	id: string;
	/** The destination's name, included in the body of each notification. */
	name: string;
	/** The endpoint Cloudflare posts to. */
	url: string;
	/** The kind of webhook (`generic` for a plain one). */
	type?: string;
	/** When a delivery last succeeded. */
	last_success?: string | null;
	/** When a delivery last failed. */
	last_failure?: string | null;
}

/** What a webhook destination is made from. */
export interface CfWebhookDestinationInput {
	/** The destination's name. */
	name: string;
	/** The endpoint Cloudflare posts to. */
	url: string;
	/** Sent as is in the `cf-webhook-auth` header of every delivery. A credential. */
	secret?: string;
}

/** The delivery targets of a notification policy. */
export interface CfPolicyMechanisms {
	/** Webhook destinations, by id. */
	webhooks?: Array<{ id: string }>;
	/** Email addresses. */
	email?: Array<{ id: string }>;
	/** PagerDuty services. */
	pagerduty?: Array<{ id: string }>;
}

/** What a notification policy is made from. */
export interface CfNotificationPolicyInput {
	/** The policy's name. */
	name: string;
	/** The event that triggers it. */
	alert_type: string;
	/** Whether it is on. */
	enabled: boolean;
	/** Where it is sent. */
	mechanisms: CfPolicyMechanisms;
	/** A description. */
	description?: string;
	/** Criteria narrowing the events, which depend on the alert type. */
	filters?: Record<string, unknown>;
	/** Minimum time between notifications. */
	alert_interval?: string;
}

/** A notification policy: an alert type and where it is sent. */
export interface CfNotificationPolicy extends CfNotificationPolicyInput {
	/** The policy's identifier. */
	id: string;
}

/** Cloudflare notifications (`/alerting/v3`): webhook destinations and the policies that send to them. */
export function alerting(rest: RestClient) {
	return {
		webhooks: {
			list: async (accountId: string): Promise<CfWebhookDestination[]> =>
				(await cfRequest<CfWebhookDestination[] | undefined>(
					rest,
					"GET",
					`/accounts/${accountId}/alerting/v3/destinations/webhooks`
				)) ?? [],

			create: (accountId: string, input: CfWebhookDestinationInput): Promise<{ id: string }> =>
				cfRequest<{ id: string }>(
					rest,
					"POST",
					`/accounts/${accountId}/alerting/v3/destinations/webhooks`,
					input
				),
		},
		policies: {
			list: async (accountId: string): Promise<CfNotificationPolicy[]> =>
				(await cfRequest<CfNotificationPolicy[] | undefined>(
					rest,
					"GET",
					`/accounts/${accountId}/alerting/v3/policies`
				)) ?? [],

			create: (accountId: string, input: CfNotificationPolicyInput): Promise<{ id: string }> =>
				cfRequest<{ id: string }>(rest, "POST", `/accounts/${accountId}/alerting/v3/policies`, input),

			update: (accountId: string, policyId: string, input: CfNotificationPolicyInput): Promise<{ id: string }> =>
				cfRequest<{ id: string }>(
					rest,
					"PUT",
					`/accounts/${accountId}/alerting/v3/policies/${policyId}`,
					input
				),
		},
	};
}
