import type { Notifications } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { SlackNotifications, type SlackNotificationsOptions } from "./capabilities/notifications.js";
import { createSlackClient, type SlackClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Slack plugin: the token lookup inputs plus the notification defaults. */
export interface SlackPluginOptions extends ResolveTokenInput, SlackNotificationsOptions {
	/** Override base URL for tests. Default: https://slack.com/api */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** Shared state for one Slack plugin instance: its options and a lazily created client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: SlackPluginOptions;
	/** Memoized client — the token is resolved on first use, not at plugin load. */
	client: () => SlackClient;
}

/** Builds the plugin context from its options. */
export function createContext(options: SlackPluginOptions = {}): PluginContext {
	let client: SlackClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createSlackClient({
				token: resolveToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

/** Builds the `notifications` capability for the context. */
export function notifications(ctx: PluginContext): Notifications {
	return new SlackNotifications(ctx.client, ctx.options);
}

/** Creates the Slack plugin: its `connection` probe and the `notifications` capability. */
export function createPlugin(options: SlackPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-slack",
		probes: {
			connection: connectionProbe({
				provider: "Slack",
				url: options.baseUrl ?? "https://slack.com",
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

/** Hint printed by `holocron auth set slack` when no token is supplied or the token is rejected; explains how to create a bot token. */
export const AUTH_HINT =
	"create a Slack app at https://api.slack.com/apps, add the chat:write bot scope, " +
	"install it to your workspace, copy the Bot User OAuth Token (xoxb-...), " +
	"then run: holocron auth set slack <xoxb-TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { SlackNotifications, type SlackNotificationsOptions } from "./capabilities/notifications.js";
export { createSlackClient, type SlackClient, type SlackClientOptions } from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
