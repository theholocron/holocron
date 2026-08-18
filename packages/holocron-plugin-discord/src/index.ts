import type { Notifications } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { DiscordNotifications, type DiscordNotificationsOptions } from "./capabilities/notifications.js";
import { createDiscordClient, type DiscordClient } from "./rest.js";

export interface DiscordPluginOptions extends ResolveTokenInput, DiscordNotificationsOptions {
	/** Override base URL for tests. Default: https://discord.com/api/v10 */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: DiscordPluginOptions;
	client: DiscordClient;
	defaultWebhookUrl: string;
}

export function createContext(options: DiscordPluginOptions = {}): PluginContext {
	// The resolved token IS the default webhook URL for Discord.
	const defaultWebhookUrl = resolveToken(options);
	return {
		options,
		client: createDiscordClient({ baseUrl: options.baseUrl, fetch: options.fetch }),
		defaultWebhookUrl,
	};
}

export function notifications(ctx: PluginContext): Notifications {
	return new DiscordNotifications(ctx.client, {
		...ctx.options,
		defaultChannel: ctx.options.defaultChannel ?? ctx.defaultWebhookUrl,
	});
}

export function createPlugin(options: DiscordPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-discord",
		capabilities: {
			notifications: () => notifications(ctx),
		},
	};
}

export const AUTH_HINT =
	"create a webhook in Discord: open your server → channel settings → Integrations → Webhooks → New Webhook, " +
	"copy the webhook URL, then run: holocron auth set discord <https://discord.com/api/webhooks/...>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { DiscordNotifications, type DiscordNotificationsOptions } from "./capabilities/notifications.js";
export {
	createDiscordClient,
	type DiscordClient,
	type DiscordClientOptions,
	type DiscordWebhookInfo,
	parseWebhookUrl,
} from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
