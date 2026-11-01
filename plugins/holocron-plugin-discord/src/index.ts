import type { Notifications } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveBotToken, resolveClientSecret, resolveToken, type ResolveTokenInput } from "./auth.js";
import { DiscordNotifications, type DiscordNotificationsOptions } from "./capabilities/notifications.js";
import {
	createDiscordBotClient,
	createDiscordClient,
	createDiscordOAuthClient,
	type DiscordBotClient,
	type DiscordClient,
	type DiscordOAuthClient,
} from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Discord plugin: how the webhook URL is resolved plus the notifications settings. */
export interface DiscordPluginOptions extends ResolveTokenInput, DiscordNotificationsOptions {
	/** Override base URL for tests. Default: https://discord.com/api/v10 */
	baseUrl?: string;
	/** The `fetch` to use instead of the global one, for tests. */
	fetch?: typeof fetch;
	/**
	 * Also send the BOT token to `baseUrl`. Off by default: `baseUrl` comes from a
	 * repo's config, and a changed config must not be able to redirect the bot
	 * token to another host. Tests that stub the API set it.
	 */
	unsafeBotBaseUrl?: boolean;
}

/** The shared state the Discord plugin's capability and probes are built from. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: DiscordPluginOptions;
	/** The webhook client used to send messages. */
	client: DiscordClient;
	/**
	 * Memoized — the resolved "token" IS Discord's default webhook URL, and it is
	 * resolved on first `send()`, not at plugin load. `describe()` never calls it.
	 */
	defaultWebhookUrl: () => string;
	/** Memoized — resolves the bot token on the first provisioning call, or when `holocron doctor` checks a provider that has a `guildId`; `send()` and `describe()` never touch it. */
	bot: () => DiscordBotClient;
	/** Builds the OAuth client for one redirect URI; resolves the application id and the client secret on first use. */
	oauth: (redirectUri: string) => Promise<DiscordOAuthClient>;
}

/** Builds the plugin context from its options; the webhook URL, bot token and client secret are each resolved on first use. */
export function createContext(options: DiscordPluginOptions = {}): PluginContext {
	let url: string | undefined;
	let bot: DiscordBotClient | undefined;
	let applicationId: Promise<string> | undefined;
	const botClient = () =>
		(bot ??= createDiscordBotClient({
			// The bot token is a different credential from the webhook URL in `options.cliToken`.
			botToken: resolveBotToken({ env: options.env, keyring: options.keyring, org: options.org }),
			...(options.unsafeBotBaseUrl && options.baseUrl ? { baseUrl: options.baseUrl } : {}),
			...(options.fetch ? { fetch: options.fetch } : {}),
		}));
	return {
		options,
		client: createDiscordClient({ baseUrl: options.baseUrl, fetch: options.fetch }),
		defaultWebhookUrl: () => (url ??= resolveToken(options)),
		bot: botClient,
		oauth: async (redirectUri) => {
			// The application's id is its OAuth client id, so it is read from the bot's own application.
			applicationId ??= botClient()
				.application.get()
				.then((app) => app.id)
				.catch((err: unknown) => {
					applicationId = undefined;
					throw err;
				});
			return createDiscordOAuthClient({
				clientId: await applicationId,
				clientSecret: resolveClientSecret({ env: options.env, keyring: options.keyring, org: options.org }),
				redirectUri,
				...(options.unsafeBotBaseUrl && options.baseUrl ? { baseUrl: options.baseUrl } : {}),
				...(options.fetch ? { fetch: options.fetch } : {}),
			});
		},
	};
}

/** Builds the `notifications` capability for a context. */
export function notifications(ctx: PluginContext): Notifications {
	return new DiscordNotifications(ctx.client, ctx.options, ctx.defaultWebhookUrl, ctx.bot, ctx.oauth);
}

/** Creates the Discord plugin: its `notifications` capability and its `connection` probe. */
export function createPlugin(options: DiscordPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-discord",
		probes: {
			connection: connectionProbe({
				provider: "Discord",
				url: options.baseUrl ?? "https://discord.com",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
		capabilities: {
			notifications: () => notifications(ctx),
		},
	};
}

/** One-line hint printed by `holocron auth set discord` when no webhook URL is supplied or the supplied one is rejected. */
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
