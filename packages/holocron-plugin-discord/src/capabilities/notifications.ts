import type { Notifications } from "@theholocron/cli";

import { parseWebhookUrl, type DiscordClient } from "../rest.js";

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
		private readonly opts: DiscordNotificationsOptions
	) {}

	async send(channel: string, message: string): Promise<void> {
		const webhookUrl = this.resolve(channel || (this.opts.defaultChannel ?? ""));
		const { id, token } = parseWebhookUrl(webhookUrl);
		await this.client.webhooks.execute(id, token, message);
	}

	private resolve(channel: string): string {
		// 1. Named alias
		const alias = this.opts.webhooks?.[channel];
		if (alias) return alias;
		// 2. Raw webhook URL
		if (channel.startsWith("https://")) return channel;
		// 3. defaultChannel (may itself be an alias or raw URL)
		const def = this.opts.defaultChannel;
		if (def) return this.opts.webhooks?.[def] ?? def;
		throw new Error(`DiscordNotifications.send: unknown channel "${channel}" — pass a webhook URL, an alias key, or set defaultChannel`);
	}
}
