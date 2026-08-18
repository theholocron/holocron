import type { Notifications } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { SlackNotifications, type SlackNotificationsOptions } from "./capabilities/notifications.js";
import { createSlackClient, type SlackClient } from "./rest.js";

export interface SlackPluginOptions extends ResolveTokenInput, SlackNotificationsOptions {
	/** Override base URL for tests. Default: https://slack.com/api */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: SlackPluginOptions;
	client: SlackClient;
}

export function createContext(options: SlackPluginOptions = {}): PluginContext {
	const token = resolveToken(options);
	return {
		options,
		client: createSlackClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function notifications(ctx: PluginContext): Notifications {
	return new SlackNotifications(ctx.client, ctx.options);
}

export function createPlugin(options: SlackPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-slack",
		capabilities: {
			notifications: () => notifications(ctx),
		},
	};
}

export const AUTH_HINT =
	"create a Slack app at https://api.slack.com/apps, add the chat:write bot scope, " +
	"install it to your workspace, copy the Bot User OAuth Token (xoxb-...), " +
	"then run: holocron auth set slack <xoxb-TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { SlackNotifications, type SlackNotificationsOptions } from "./capabilities/notifications.js";
export { createSlackClient, type SlackClient, type SlackClientOptions } from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
