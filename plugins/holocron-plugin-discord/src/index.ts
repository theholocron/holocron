import type { Notifications } from "@theholocron/cli";

import { resolveBotToken, resolveToken, type ResolveTokenInput } from "./auth.js";
import { DiscordNotifications, type DiscordNotificationsOptions } from "./capabilities/notifications.js";
import { createDiscordBotClient, createDiscordClient, type DiscordBotClient, type DiscordClient } from "./rest.js";

export interface DiscordPluginOptions extends ResolveTokenInput, DiscordNotificationsOptions {
	/** Override base URL for tests. Default: https://discord.com/api/v10 */
	baseUrl?: string;
	fetch?: typeof fetch;
	/**
	 * Also send the BOT token to `baseUrl`. Off by default: `baseUrl` comes from a
	 * repo's config, and a changed config must not be able to redirect the bot
	 * token to another host. Tests that stub the API set it.
	 */
	unsafeBotBaseUrl?: boolean;
}

export interface PluginContext {
	options: DiscordPluginOptions;
	client: DiscordClient;
	/**
	 * Memoized — the resolved "token" IS Discord's default webhook URL, and it is
	 * resolved on first `send()`, not at plugin load. `describe()` never calls it.
	 */
	defaultWebhookUrl: () => string;
	/** Memoized — resolves the bot token on the first provisioning call; `send()` and `describe()` never touch it. */
	bot: () => DiscordBotClient;
}

export function createContext(options: DiscordPluginOptions = {}): PluginContext {
	let url: string | undefined;
	let bot: DiscordBotClient | undefined;
	return {
		options,
		client: createDiscordClient({ baseUrl: options.baseUrl, fetch: options.fetch }),
		defaultWebhookUrl: () => (url ??= resolveToken(options)),
		bot: () =>
			(bot ??= createDiscordBotClient({
				// The bot token is a different credential from the webhook URL in `options.cliToken`.
				botToken: resolveBotToken({ env: options.env, keyring: options.keyring, org: options.org }),
				...(options.unsafeBotBaseUrl && options.baseUrl ? { baseUrl: options.baseUrl } : {}),
				...(options.fetch ? { fetch: options.fetch } : {}),
			})),
	};
}

export function notifications(ctx: PluginContext): Notifications {
	return new DiscordNotifications(ctx.client, ctx.options, ctx.defaultWebhookUrl, ctx.bot);
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
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
