import { DEFAULT_BASE_URL, type DiscordClientOptions } from "./utils.js";
import { webhooks } from "./webhooks/webhooks.js";

export * from "./bot/index.js";
export * from "./oauth/index.js";
export type { DiscordClientOptions } from "./utils.js";
export type { DiscordWebhookInfo } from "./webhooks/webhooks.js";
export { parseWebhookUrl } from "./webhooks/webhooks.js";

/** Builds the webhook client: a `webhooks` group that reads, posts to and deletes messages from a webhook by its id and token. */
export function createDiscordClient(opts: DiscordClientOptions = {}) {
	const base = opts.baseUrl ?? DEFAULT_BASE_URL;
	const f = opts.fetch ?? globalThis.fetch;
	return {
		webhooks: webhooks(base, f),
	};
}

/** The client `createDiscordClient` returns. */
export type DiscordClient = ReturnType<typeof createDiscordClient>;
