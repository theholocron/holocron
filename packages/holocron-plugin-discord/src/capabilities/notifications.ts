import type { Notifications } from "@theholocron/cli";

import { type DiscordClient, parseWebhookUrl } from "../rest.js";

export interface DiscordNotificationsOptions {
	/**
	 * Named aliases mapping a logical channel name to its webhook URL.
	 * Allows `send("deploys", msg)` instead of passing the full URL.
	 */
	webhooks?: Record<string, string>;
	/**
	 * Default webhook URL (or alias key) used when `send()` is called
	 * without an explicit channel, or with an empty string.
	 */
	defaultChannel?: string;
}

export class DiscordNotifications implements Notifications {
	readonly key = "notifications" as const;
	readonly providerName = "discord";

	constructor(
		private readonly client: DiscordClient,
		private readonly opts: DiscordNotificationsOptions,
		/** Memoized thunk — resolves the default webhook URL on the first `send()`. */
		private readonly defaultWebhookUrl: () => string
	) {}

	async send(channel: string, message: string): Promise<void> {
		const webhookUrl = this.resolve(channel || this.opts.defaultChannel || "");
		const { id, token } = parseWebhookUrl(webhookUrl);
		await this.client.webhooks.execute(id, token, message);
	}

	private resolve(channel: string): string {
		// 1. Named alias
		const alias = this.opts.webhooks?.[channel];
		if (alias) return alias;
		// 2. Raw webhook URL
		if (channel.startsWith("https://")) return channel;
		// 3. defaultChannel option (may itself be an alias or raw URL)
		const def = this.opts.defaultChannel;
		if (def) return this.opts.webhooks?.[def] ?? def;
		// 4. the resolved token (the Discord webhook URL) — resolved lazily here
		return this.defaultWebhookUrl();
	}
}
