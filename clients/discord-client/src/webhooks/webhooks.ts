import { ProviderApiError } from "@theholocron/http-client";

/** What fetching a webhook by id and token returns. */
export interface DiscordWebhookInfo {
	/** The webhook id. */
	id: string;
	/** The webhook name. */
	name: string;
	/** Id of the server the webhook belongs to, when Discord includes it. */
	guild_id?: string;
}

/**
 * Discord webhooks don't use an Authorization header — the webhook id+token
 * are embedded in the URL path — so this resource takes `base`/`fetch`
 * directly rather than a shared `RestClient` built around a static token.
 */
export function webhooks(base: string, f: typeof fetch) {
	return {
		get: async (id: string, token: string): Promise<DiscordWebhookInfo> => {
			let res: Response;
			try {
				res = await f(`${base}/webhooks/${id}/${token}`, { method: "GET" });
			} catch (err) {
				const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
				throw new ProviderApiError(`Discord GET /webhooks failed: ${detail}`, 0, undefined);
			}
			if (!res.ok) {
				throw new ProviderApiError(
					`Discord webhook not found or invalid (${res.status})`,
					res.status,
					undefined
				);
			}
			return res.json() as Promise<DiscordWebhookInfo>;
		},

		execute: async (id: string, token: string, content: string): Promise<void> => {
			let res: Response;
			try {
				res = await f(`${base}/webhooks/${id}/${token}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ content }),
				});
			} catch (err) {
				const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
				throw new ProviderApiError(`Discord POST /webhooks failed: ${detail}`, 0, undefined);
			}
			// 204 No Content on success.
			if (!res.ok) {
				throw new ProviderApiError(`Discord webhook POST failed (${res.status})`, res.status, undefined);
			}
		},

		/** Posts and waits for Discord to answer with the message, so a check can read it back or delete it. */
		executeAndWait: async (id: string, token: string, content: string): Promise<{ id: string }> => {
			let res: Response;
			try {
				res = await f(`${base}/webhooks/${id}/${token}?wait=true`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
				});
			} catch (err) {
				const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
				throw new ProviderApiError(`Discord POST /webhooks failed: ${detail}`, 0, undefined);
			}
			if (!res.ok) {
				throw new ProviderApiError(`Discord webhook POST failed (${res.status})`, res.status, undefined);
			}
			return res.json() as Promise<{ id: string }>;
		},

		/** Removes a message this webhook posted, e.g. a smoke-test line. A 404 counts as done. */
		deleteMessage: async (id: string, token: string, messageId: string): Promise<void> => {
			let res: Response;
			try {
				res = await f(`${base}/webhooks/${id}/${token}/messages/${messageId}`, { method: "DELETE" });
			} catch (err) {
				const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
				throw new ProviderApiError(`Discord DELETE /webhooks failed: ${detail}`, 0, undefined);
			}
			if (!res.ok && res.status !== 404) {
				throw new ProviderApiError(`Discord webhook DELETE failed (${res.status})`, res.status, undefined);
			}
		},
	};
}

/** Parse a Discord webhook URL into its id and token parts. */
export function parseWebhookUrl(url: string): { id: string; token: string } {
	const match = url.match(/webhooks\/(\d+)\/([^/?#]+)/);
	if (!match) throw new Error(`Invalid Discord webhook URL: ${url}`);
	return { id: match[1]!, token: match[2]! };
}
