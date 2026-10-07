import { DEFAULT_BASE_URL, type DiscordClientOptions } from "./utils.js";
import { webhooks } from "./webhooks/webhooks.js";

export type { DiscordClientOptions } from "./utils.js";
export type { DiscordWebhookInfo } from "./webhooks/webhooks.js";
export { parseWebhookUrl } from "./webhooks/webhooks.js";

export function createDiscordClient(opts: DiscordClientOptions = {}) {
	const base = opts.baseUrl ?? DEFAULT_BASE_URL;
	const f = opts.fetch ?? globalThis.fetch;
	return {
		webhooks: webhooks(base, f),
	};
}

export type DiscordClient = ReturnType<typeof createDiscordClient>;
