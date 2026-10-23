import type { EnsuredResource, EnsureWebhookResult, Notifications, NotificationsLayout } from "@theholocron/cli";

import {
	ChannelType,
	type DiscordBotClient,
	type DiscordChannel,
	type DiscordClient,
	parseWebhookUrl,
} from "../rest.js";

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

	/**
	 * `holocron doctor`: the bot token is valid and can see the configured server.
	 * Null when no `guildId` is set -- a post-only config has no bot to check. A
	 * `layout` without a `guildId` is a half-written provisioning config, so that
	 * fails instead of passing as post-only.
	 */
	async whoami(): Promise<{ target: string } | null> {
		if (!this.opts.guildId) {
			if (this.opts.layout) {
				throw new Error(
					"`layout` is set but `guildId` is not — add the server id to the discord provider options"
				);
			}
			return null;
		}
		const bot = this.bot();
		const me = await bot.users.me();
		const guild = await bot.guilds.get(this.opts.guildId);
		return { target: `${guild.name} (as ${me.username})` };
	}

	private guild(): string {
		if (!this.opts.guildId) {
			throw new Error(
				"no Discord server id — set `guildId` in the discord provider options in holocron.config.ts"
			);
		}
		return this.opts.guildId;
	}

	/**
	 * The server's channel list, fetched once per instance. Every ensure* call used
	 * to refetch it -- about 40 identical GETs in one setup run -- and Discord
	 * rate-limited the route. Our own creates and edits update the copy, so it
	 * stays accurate for the run; a new run builds a new instance.
	 *
	 * It is the in-flight promise that is shared, not the array: callers that start
	 * while the first fetch is pending all get the same snapshot, so a later
	 * response can never overwrite what an earlier caller added.
	 */
	private channelLoad?: Promise<DiscordChannel[]>;

	private channelList(): Promise<DiscordChannel[]> {
		return (this.channelLoad ??= this.bot()
			.guilds.channels(this.guild())
			.catch((err: unknown) => {
				this.channelLoad = undefined; // a failed fetch must not be remembered
				throw err;
			}));
	}

	/**
	 * Create a channel and add it to the shared list. If the create fails, Discord
	 * may still have applied it (a timeout looks the same as a refusal), so forget the
	 * list: the next ensure refetches the server's real state instead of creating a
	 * duplicate.
	 */
	private async createChannel(
		body: Parameters<DiscordBotClient["guilds"]["createChannel"]>[1]
	): Promise<DiscordChannel> {
		try {
			const made = await this.bot().guilds.createChannel(this.guild(), body);
			(await this.channelList()).push(made);
			return made;
		} catch (err) {
			this.channelLoad = undefined;
			throw err;
		}
	}

	// Discord lower-cases text-channel names on creation, so compare case-insensitively.
	private static same(a: string, b: string): boolean {
		return a.toLowerCase() === b.toLowerCase();
	}

	async ensureCategory(name: string): Promise<EnsuredResource> {
		const existing = (await this.channelList()).find(
			(c) => c.type === ChannelType.Category && DiscordNotifications.same(c.name, name)
		);
		if (existing) return { id: existing.id, created: false };
		const made = await this.createChannel({ name, type: ChannelType.Category });
		return { id: made.id, created: true };
	}

	/**
	 * Find a channel by name. A name can exist in several categories, so with a
	 * parent: prefer the one already there, then an uncategorised one (moved in);
	 * never grab a channel that lives under a different category. Announcement
	 * channels count: reusing one beats creating a same-named text channel.
	 */
	private static findChannel(
		channels: DiscordChannel[],
		name: string,
		parentId?: string
	): DiscordChannel | undefined {
		const named = channels.filter(
			(c) =>
				(c.type === ChannelType.Text || c.type === ChannelType.Announcement) &&
				DiscordNotifications.same(c.name, name)
		);
		if (!parentId) return named[0];
		return named.find((c) => c.parent_id === parentId) ?? named.find((c) => !c.parent_id);
	}

	async ensureChannel(input: { name: string; category?: string; topic?: string }): Promise<EnsuredResource> {
		const bot = this.bot();
		const parent = input.category ? (await this.ensureCategory(input.category)).id : undefined;
		const existing = DiscordNotifications.findChannel(await this.channelList(), input.name, parent);
		if (existing) {
			// Already there: reconcile what the layout asks for (category, topic), leave the rest.
			const patch = {
				...(parent && existing.parent_id !== parent ? { parent_id: parent } : {}),
				...(input.topic !== undefined && (existing.topic ?? "") !== input.topic ? { topic: input.topic } : {}),
			};
			if (Object.keys(patch).length > 0) {
				try {
					await bot.channels.modify(existing.id, patch);
				} catch (err) {
					this.channelLoad = undefined; // may have applied; see createChannel
					throw err;
				}
				Object.assign(existing, patch);
			}
			return { id: existing.id, created: false };
		}
		const made = await this.createChannel({
			name: input.name,
			type: ChannelType.Text,
			...(input.topic ? { topic: input.topic } : {}),
			...(parent ? { parent_id: parent } : {}),
		});
		return { id: made.id, created: true };
	}

	async ensureWebhook(input: { channel: string; name: string; category?: string }): Promise<EnsureWebhookResult> {
		const bot = this.bot();
		const parent = input.category
			? (await this.channelList()).find(
					(c) => c.type === ChannelType.Category && DiscordNotifications.same(c.name, input.category!)
				)?.id
			: undefined;
		const channel = DiscordNotifications.findChannel(await this.channelList(), input.channel, parent);
		if (!channel) throw new Error(`no channel named \`${input.channel}\` — create it first`);
		const existing = (await bot.channels.webhooks(channel.id)).find((w) =>
			DiscordNotifications.same(w.name ?? "", input.name)
		);
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
		if (existing) {
			// We cannot edit a role yet (no role-modify call in the client, tracked in #1098), so a role
			// that disagrees with the layout is a failure, not something to report as "exists" and ignore:
			// an unmentionable alert role makes every ping silently do nothing.
			if (input.mentionable !== undefined && existing.mentionable !== input.mentionable) {
				throw new Error(
					`role \`${input.name}\` exists with mentionable=${existing.mentionable} but the layout wants ${input.mentionable}; ` +
						"updating an existing role is not supported yet — change it in Discord (Role → Allow anyone to @mention this role)"
				);
			}
			return { id: existing.id, created: false };
		}
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
