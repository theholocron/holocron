import type { RestClient } from "../utils.js";

/** A webhook of a Doppler project, as the list call returns it. The signing secret is never returned. */
export interface DopplerWebhook {
	/** The webhook's slug. */
	id?: string;
	/** The webhook's name. */
	name?: string;
	/** Where Doppler posts. */
	url?: string;
	/** Whether the webhook is on. */
	enabled?: boolean;
	/** Whether a signing secret is set (the value is never returned). */
	hasSecret?: boolean;
	/** The config slugs it fires for. */
	enabledConfigs?: string[];
	/** Whether the caller may change it. */
	canManage?: boolean;
}

/** The response of listing a project's webhooks. */
export interface DopplerWebhooksResponse {
	/** The project's webhooks. */
	webhooks?: DopplerWebhook[];
}

/** What creating a webhook takes. */
export interface DopplerWebhookInput {
	/** An https URL. */
	url: string;
	/** The webhook's name. */
	name?: string;
	/** The signing secret Doppler uses for `X-Doppler-Signature`. A credential. */
	secret?: string;
	/** The config slugs it fires for. */
	enableConfigs?: string[];
}

export function webhooks(rest: RestClient) {
	return {
		list: (project: string): Promise<DopplerWebhooksResponse> =>
			rest.request<DopplerWebhooksResponse>(`/webhooks?project=${encodeURIComponent(project)}`),
		create: (project: string, input: DopplerWebhookInput): Promise<unknown> =>
			rest.request<unknown>(`/webhooks?project=${encodeURIComponent(project)}`, { method: "POST", body: input }),
	};
}
