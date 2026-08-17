import { ProviderApiError } from "@theholocron/cli";

export interface DiscordClientOptions {
	/** Override base URL for tests. Default: https://discord.com/api/v10 */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface DiscordWebhookInfo {
	id: string;
	name: string;
	guild_id?: string;
}

export interface DiscordClient {
	webhooks: {
		get(id: string, token: string): Promise<DiscordWebhookInfo>;
		execute(id: string, token: string, content: string): Promise<void>;
	};
}

// Discord webhooks don't use an Authorization header — the webhook id+token
// are embedded in the URL path, so we use raw fetch rather than createRestClient.
export function createDiscordClient({ baseUrl, fetch: fetchImpl }: DiscordClientOptions = {}): DiscordClient {
	const base = baseUrl ?? "https://discord.com/api/v10";
	const f = fetchImpl ?? globalThis.fetch;

	return {
		webhooks: {
			get: async (id, token) => {
				const res = await f(`${base}/webhooks/${id}/${token}`, { method: "GET" });
				if (!res.ok) throw new ProviderApiError(`Discord webhook not found or invalid (${res.status})`, res.status, undefined);
				return res.json() as Promise<DiscordWebhookInfo>;
			},
			execute: async (id, token, content) => {
				const res = await f(`${base}/webhooks/${id}/${token}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ content }),
				});
				// 204 No Content on success
				if (!res.ok) throw new ProviderApiError(`Discord webhook POST failed (${res.status})`, res.status, undefined);
			},
		},
	};
}

/** Parse a Discord webhook URL into its id and token parts. */
export function parseWebhookUrl(url: string): { id: string; token: string } {
	const match = url.match(/webhooks\/(\d+)\/([^/?#]+)/);
	if (!match) throw new Error(`Invalid Discord webhook URL: ${url}`);
	return { id: match[1]!, token: match[2]! };
}
