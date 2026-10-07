import { ProviderApiError } from "@theholocron/http-client";

export interface DiscordWebhookInfo {
	id: string;
	name: string;
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
	};
}

/** Parse a Discord webhook URL into its id and token parts. */
export function parseWebhookUrl(url: string): { id: string; token: string } {
	const match = url.match(/webhooks\/(\d+)\/([^/?#]+)/);
	if (!match) throw new Error(`Invalid Discord webhook URL: ${url}`);
	return { id: match[1]!, token: match[2]! };
}
