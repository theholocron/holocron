import type { EnsuredResource, EnsureWebhookResult, Notifications, NotificationsLayout } from "@theholocron/cli";

import { ChannelType, type DiscordBotClient, type DiscordClient, parseWebhookUrl } from "../rest.js";

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
	/** Discord server (guild) id that `notifications setup` provisions. Not a secret. */
	guildId?: string;
	/** The server layout `notifications setup` applies. */
	layout?: NotificationsLayout;
}

export class DiscordNotifications implements Notifications {
	readonly key = "notifications" as const;
	readonly providerName = "discord";

	constructor(
		private readonly client: DiscordClient,
		private readonly opts: DiscordNotificationsOptions,
		/** Memoized thunk — resolves the default webhook URL on the first `send()`. */
		private readonly defaultWebhookUrl: () => string,
		/** Memoized thunk — resolves the bot token on first provisioning call, never on `send()`. */
		private readonly bot: () => DiscordBotClient = () => {
			throw new Error("no Discord bot client configured");
		}
	) {}

	get layout(): NotificationsLayout | undefined {
		return this.opts.layout;
	}

	async send(channel: string, message: string): Promise<void> {
		const webhookUrl = this.resolve(channel || this.opts.defaultChannel || "");
		const { id, token } = parseWebhookUrl(webhookUrl);
		await this.client.webhooks.execute(id, token, message);
	}

	private guild(): string {
		if (!this.opts.guildId) {
			throw new Error(
				"no Discord server id — set `guildId` in the discord provider options in holocron.config.ts"
			);
		}
		return this.opts.guildId;
	}

	// Discord lower-cases text-channel names on creation, so compare case-insensitively.
	private static same(a: string, b: string): boolean {
		return a.toLowerCase() === b.toLowerCase();
	}

	async ensureCategory(name: string): Promise<EnsuredResource> {
		const bot = this.bot();
		const existing = (await bot.guilds.channels(this.guild())).find(
			(c) => c.type === ChannelType.Category && DiscordNotifications.same(c.name, name)
		);
		if (existing) return { id: existing.id, created: false };
		const made = await bot.guilds.createChannel(this.guild(), { name, type: ChannelType.Category });
		return { id: made.id, created: true };
	}

	async ensureChannel(input: { name: string; category?: string; topic?: string }): Promise<EnsuredResource> {
		const bot = this.bot();
		const parent = input.category ? (await this.ensureCategory(input.category)).id : undefined;
		const existing = (await bot.guilds.channels(this.guild())).find(
			(c) => c.type === ChannelType.Text && DiscordNotifications.same(c.name, input.name)
		);
		if (existing) {
			// Already there: only move it if it was asked to live under a different category.
			if (parent && existing.parent_id !== parent) await bot.channels.modify(existing.id, { parent_id: parent });
			return { id: existing.id, created: false };
		}
		const made = await bot.guilds.createChannel(this.guild(), {
			name: input.name,
			type: ChannelType.Text,
			...(input.topic ? { topic: input.topic } : {}),
			...(parent ? { parent_id: parent } : {}),
		});
		return { id: made.id, created: true };
	}

	async ensureWebhook(input: { channel: string; name: string }): Promise<EnsureWebhookResult> {
		const bot = this.bot();
		const channel = (await bot.guilds.channels(this.guild())).find(
			(c) => c.type === ChannelType.Text && DiscordNotifications.same(c.name, input.channel)
		);
		if (!channel) throw new Error(`no channel named \`${input.channel}\` — create it first`);
		const existing = (await bot.channels.webhooks(channel.id)).find((w) => w.name === input.name);
		// `url` is only present for webhooks this bot created; otherwise Discord will not say it again.
		if (existing) return { created: false, ...(existing.url ? { url: existing.url } : {}) };
		const made = await bot.channels.createWebhook(channel.id, { name: input.name });
		return { created: true, ...(made.url ? { url: made.url } : {}) };
	}

	async ensureRole(input: { name: string; mentionable?: boolean }): Promise<EnsuredResource> {
		const bot = this.bot();
		const existing = (await bot.guilds.roles(this.guild())).find((r) =>
			DiscordNotifications.same(r.name, input.name)
		);
		if (existing) return { id: existing.id, created: false };
		const made = await bot.guilds.createRole(this.guild(), {
			name: input.name,
			...(input.mentionable !== undefined ? { mentionable: input.mentionable } : {}),
		});
		return { id: made.id, created: true };
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
