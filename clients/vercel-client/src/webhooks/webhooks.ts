import type { RestClient } from "../utils.js";

/** A webhook as Vercel lists it. The list carries no signing secret. */
export interface VercelWebhook {
	/** The webhook id (`account_hook_...`). */
	id: string;
	/** Where Vercel posts. */
	url: string;
	/** The event names it subscribes to. */
	events: string[];
	/** The projects it is limited to; empty or absent for every project. */
	projectIds?: string[];
	/** The team that owns it. */
	ownerId?: string;
}

/** The response of `webhooks.create()`: the only time Vercel returns the signing `secret`. */
export interface VercelCreatedWebhook extends VercelWebhook {
	/** The secret Vercel signs payloads with (`x-vercel-signature`, HMAC-SHA1). Never returned again. A credential. */
	secret: string;
}

/** The body of `webhooks.create()`. */
export interface VercelCreateWebhookInput {
	/** An `http(s)` URL. */
	url: string;
	/** Event names, at least one (`deployment.error`). */
	events: string[];
	/** Limit the webhook to these projects. */
	projectIds?: string[];
}

export function webhooks(rest: RestClient) {
	return {
		/** `GET /v1/webhooks`: the team's webhooks (a bare array, no secrets). */
		list: (): Promise<VercelWebhook[]> => rest.request<VercelWebhook[]>("/v1/webhooks"),

		/** `POST /v1/webhooks`: makes a webhook and returns its secret, once. */
		create: (input: VercelCreateWebhookInput): Promise<VercelCreatedWebhook> =>
			rest.request<VercelCreatedWebhook>("/v1/webhooks", { method: "POST", body: input }),
	};
}
