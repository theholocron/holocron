import {
	type EnsuredResource,
	type EnsureWebhookResult,
	type Notifications,
	type NotificationsAccess,
	type NotificationsLayout,
	ProviderApiError,
	type ServerInspection,
} from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import {
	ChannelType,
	type DiscordBotClient,
	type DiscordChannel,
	type DiscordClient,
	type DiscordPermissionOverwrite,
	type ModifyRoleInput,
	parseWebhookUrl,
	type PermissionName,
	permissionNames,
	permissions,
} from "../rest.js";

/** `#rrggbb` to Discord's integer colour. */
function colorToInt(hex: string): number {
	if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`invalid colour ${JSON.stringify(hex)}: use #rrggbb`);
	return Number.parseInt(hex.slice(1), 16);
}

/** Discord's integer colour to `#rrggbb`. 0 is Discord's "no colour", and is what `#000000` means too. */
function colorToHex(color: number): string {
	return `#${color.toString(16).padStart(6, "0")}`;
}

/** An error as one line: the message, plus Discord's own response body when there is one. */
function reason(err: unknown): string {
	return err instanceof ProviderApiError && err.details
		? `${errorMessage(err)}: ${String(err.details).slice(0, 200)}`
		: errorMessage(err);
}

/** What @everyone loses when a channel is read-only: sending, and starting or posting in threads. */
const POST: PermissionName[] = ["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"];
/** What the bot keeps in a channel it has locked down, so it can still manage it and post. */
const BOT_KEEPS: PermissionName[] = [
	"ViewChannel",
	"SendMessages",
	"ReadMessageHistory",
	"ManageChannels",
	"ManageWebhooks",
];

/** Overwrites as a comparable set: order and the shape of the array do not matter. */
function overwriteKey(list: readonly DiscordPermissionOverwrite[] | undefined): string {
	return (list ?? [])
		.map((o) => `${o.id}:${o.type}:${o.allow}:${o.deny}`)
		.sort()
		.join("|");
}

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

	/**
	 * Read-only: what is on the server, for the parts of `layout` we will compare. Webhooks are
	 * listed only for channels the layout gives one (one request each), so the cost scales with
	 * the layout, not with the server.
	 */
	async inspect(layout: NotificationsLayout): Promise<ServerInspection> {
		const bot = this.bot();
		const channels = await this.channelList();
		const categoryName = new Map(
			channels.filter((c) => c.type === ChannelType.Category).map((c) => [c.id, c.name] as const)
		);
		const wantsWebhook = new Set(
			(layout.categories ?? []).flatMap((c) =>
				(c.channels ?? []).filter((ch) => ch.webhook).map((ch) => ch.name.toLowerCase())
			)
		);
		const text = channels.filter((c) => c.type === ChannelType.Text || c.type === ChannelType.Announcement);
		const found: ServerInspection["channels"] = [];
		for (const c of text) {
			let webhooks: string[] = [];
			let webhooksError: string | undefined;
			if (wantsWebhook.has(c.name.toLowerCase())) {
				// One channel's webhook list failing must not discard everything else that was read.
				try {
					webhooks = (await bot.channels.webhooks(c.id)).map((w) => w.name ?? "");
				} catch (err) {
					webhooksError = reason(err);
				}
			}
			const category = c.parent_id ? categoryName.get(c.parent_id) : undefined;
			found.push({
				name: c.name,
				...(category ? { category } : {}),
				...(c.topic ? { topic: c.topic } : {}),
				webhooks,
				...(webhooksError ? { webhooksError } : {}),
			});
		}
		// Roles are only read when the layout declares some, and a failure is reported on its own.
		let roles: ServerInspection["roles"] = [];
		let rolesError: string | undefined;
		if ((layout.roles ?? []).length > 0) {
			try {
				roles = (await bot.guilds.roles(this.guild())).map((r) => {
					return {
						name: r.name,
						id: r.id,
						mentionable: r.mentionable,
						color: colorToHex(r.color),
						...(r.hoist !== undefined ? { hoist: r.hoist } : {}),
						...(r.permissions !== undefined ? { permissions: permissionNames(r.permissions) } : {}),
					};
				});
			} catch (err) {
				rolesError = reason(err);
			}
		}
		// Who can see and post comes from the overwrites already in the channel list: no extra requests.
		const roleName = (id: string): string => roles.find((r) => r.id === id)?.name ?? id;
		found.forEach((entry, i) => {
			entry.access = this.accessOf(text[i]!.permission_overwrites, roleName);
		});
		const categoryAccess: Record<string, Required<NotificationsAccess>> = {};
		for (const c of channels.filter((c) => c.type === ChannelType.Category)) {
			categoryAccess[c.name] = this.accessOf(c.permission_overwrites, roleName);
		}
		return {
			categories: [...categoryName.values()],
			categoryAccess,
			channels: found,
			roles,
			...(rolesError ? { rolesError } : {}),
		};
	}

	validateLayout(layout: NotificationsLayout): string | undefined {
		for (const role of layout.roles ?? []) {
			try {
				if (role.color !== undefined) colorToInt(role.color);
				if (role.permissions !== undefined) permissions(role.permissions as PermissionName[]);
			} catch (err) {
				return `role \`${role.name}\`: ${errorMessage(err)}`;
			}
		}
		return undefined;
	}

	private botUser?: Promise<string>;

	private botId(): Promise<string> {
		return (this.botUser ??= this.bot()
			.users.me()
			.then((u) => u.id)
			.catch((err: unknown) => {
				this.botUser = undefined;
				throw err;
			}));
	}

	/**
	 * The overwrites that make a channel look like `access`. The list is exact: it replaces
	 * whatever was set by hand. `[]` (public) when nothing is restricted.
	 */
	private async overwritesFor(access: NotificationsAccess): Promise<DiscordPermissionOverwrite[]> {
		const view = access.view ?? "everyone";
		const post = access.post ?? "everyone";
		const everyoneDeny: PermissionName[] = [
			...(view === "everyone" ? [] : (["ViewChannel"] as PermissionName[])),
			...(post === "everyone" ? [] : POST),
		];
		if (everyoneDeny.length === 0) return [];

		const roles = await this.bot().guilds.roles(this.guild());
		const idOf = (name: string): string => {
			const found = roles.find((r) => DiscordNotifications.same(r.name, name));
			if (!found) throw new Error(`access names the role \`${name}\`, which does not exist on the server yet`);
			return found.id;
		};
		const allow = new Map<string, PermissionName[]>();
		const grant = (roleName: string, names: PermissionName[]) => {
			const id = idOf(roleName);
			allow.set(id, [...new Set([...(allow.get(id) ?? []), ...names])]);
		};
		if (view !== "everyone") for (const r of view) grant(r, ["ViewChannel"]);
		if (post !== "everyone") for (const r of post) grant(r, POST);

		const overwrites: DiscordPermissionOverwrite[] = [
			{ id: this.guild(), type: 0, allow: "0", deny: permissions(everyoneDeny) },
			...[...allow].map(([id, names]) => ({ id, type: 0 as const, allow: permissions(names), deny: "0" })),
			{ id: await this.botId(), type: 1, allow: permissions(BOT_KEEPS), deny: "0" },
		];
		return overwrites;
	}

	/** Read an access back out of a channel's overwrites, naming roles as the layout does. */
	private accessOf(
		overwrites: readonly DiscordPermissionOverwrite[] | undefined,
		roleName: (id: string) => string
	): Required<NotificationsAccess> {
		const list = overwrites ?? [];
		const everyone = list.find((o) => o.type === 0 && o.id === this.guild());
		const denies = (bit: PermissionName) => everyone !== undefined && permissionNames(everyone.deny).includes(bit);
		const allowed = (bit: PermissionName) =>
			list
				.filter((o) => o.type === 0 && o.id !== this.guild() && permissionNames(o.allow).includes(bit))
				.map((o) => roleName(o.id));
		return {
			view: denies("ViewChannel") ? allowed("ViewChannel") : "everyone",
			post: denies("SendMessages") ? allowed("SendMessages") : "everyone",
		};
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

	async ensureCategory(name: string, opts: { access?: NotificationsAccess } = {}): Promise<EnsuredResource> {
		const existing = (await this.channelList()).find(
			(c) => c.type === ChannelType.Category && DiscordNotifications.same(c.name, name)
		);
		const overwrites = opts.access ? await this.overwritesFor(opts.access) : undefined;
		if (existing) {
			if (overwrites && overwriteKey(existing.permission_overwrites) !== overwriteKey(overwrites)) {
				await this.modifyChannel(existing, { permission_overwrites: overwrites });
				return { id: existing.id, created: false, updated: ["access"] };
			}
			return { id: existing.id, created: false };
		}
		const made = await this.createChannel({
			name,
			type: ChannelType.Category,
			...(overwrites ? { permission_overwrites: overwrites } : {}),
		});
		return { id: made.id, created: true };
	}

	/** Edit a channel and keep the shared list in step; forget the list if the edit may have half-applied. */
	private async modifyChannel(
		channel: DiscordChannel,
		patch: Parameters<DiscordBotClient["channels"]["modify"]>[1]
	): Promise<void> {
		try {
			await this.bot().channels.modify(channel.id, patch);
		} catch (err) {
			this.channelLoad = undefined; // may have applied; see createChannel
			throw err;
		}
		Object.assign(channel, patch);
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

	async ensureChannel(input: {
		name: string;
		category?: string;
		topic?: string;
		access?: NotificationsAccess;
	}): Promise<EnsuredResource> {
		const parent = input.category ? (await this.ensureCategory(input.category)).id : undefined;
		const existing = DiscordNotifications.findChannel(await this.channelList(), input.name, parent);
		const overwrites = input.access ? await this.overwritesFor(input.access) : undefined;
		if (existing) {
			// Already there: reconcile what the layout asks for (category, topic, access), leave the rest.
			const updated: string[] = [];
			const patch: Parameters<DiscordBotClient["channels"]["modify"]>[1] = {};
			if (parent && existing.parent_id !== parent) {
				patch.parent_id = parent;
				updated.push("category");
			}
			if (input.topic !== undefined && (existing.topic ?? "") !== input.topic) {
				patch.topic = input.topic;
				updated.push("topic");
			}
			if (overwrites && overwriteKey(existing.permission_overwrites) !== overwriteKey(overwrites)) {
				patch.permission_overwrites = overwrites;
				updated.push("access");
			}
			if (updated.length > 0) await this.modifyChannel(existing, patch);
			return { id: existing.id, created: false, ...(updated.length > 0 ? { updated } : {}) };
		}
		const made = await this.createChannel({
			name: input.name,
			type: ChannelType.Text,
			...(input.topic ? { topic: input.topic } : {}),
			...(parent ? { parent_id: parent } : {}),
			...(overwrites ? { permission_overwrites: overwrites } : {}),
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

	async ensureRole(input: {
		name: string;
		mentionable?: boolean;
		color?: string;
		hoist?: boolean;
		permissions?: string[];
	}): Promise<EnsuredResource> {
		const bot = this.bot();
		// Validate the declared values before touching anything.
		const color = input.color !== undefined ? colorToInt(input.color) : undefined;
		const wanted = input.permissions !== undefined ? permissions(input.permissions as PermissionName[]) : undefined;
		const matches = (await bot.guilds.roles(this.guild())).filter((r) =>
			DiscordNotifications.same(r.name, input.name)
		);
		// Discord allows two roles with one name; reconciling "the first" would leave the other unmanaged.
		if (matches.length > 1) {
			throw new Error(
				`${matches.length} roles are named \`${input.name}\` (ids ${matches.map((r) => r.id).join(", ")}) — delete or rename the extras so setup knows which one to manage`
			);
		}
		const existing = matches[0];
		if (existing) {
			// Change only what disagrees, so a run on a server that already matches sends nothing.
			const patch: ModifyRoleInput = {};
			const updated: string[] = [];
			if (input.mentionable !== undefined && existing.mentionable !== input.mentionable) {
				patch.mentionable = input.mentionable;
				updated.push("mentionable");
			}
			if (color !== undefined && existing.color !== color) {
				patch.color = color;
				updated.push("colour");
			}
			if (input.hoist !== undefined && (existing.hoist ?? false) !== input.hoist) {
				patch.hoist = input.hoist;
				updated.push("hoist");
			}
			if (wanted !== undefined && existing.permissions !== wanted) {
				patch.permissions = wanted;
				updated.push("permissions");
			}
			if (updated.length > 0) {
				const after = await bot.guilds.modifyRole(this.guild(), existing.id, patch);
				// Discord answers with the role as it now is. If a field we sent is not what comes back, something
				// else changed the role at the same time (or the server dropped it): say so, do not report success.
				const stuck = (
					[
						["mentionable", patch.mentionable, after.mentionable],
						["colour", patch.color, after.color],
						["hoist", patch.hoist, after.hoist],
						["permissions", patch.permissions, after.permissions],
					] as const
				)
					.filter(([, sent, now]) => sent !== undefined && sent !== now)
					.map(([name]) => name);
				if (stuck.length > 0) {
					throw new Error(
						`role \`${input.name}\`: sent ${stuck.join(", ")} but the role came back different -- ` +
							"another setup run may be changing it at the same time; re-run once it has finished"
					);
				}
			}
			return { id: existing.id, created: false, ...(updated.length > 0 ? { updated } : {}) };
		}
		const made = await bot.guilds.createRole(this.guild(), {
			name: input.name,
			...(input.mentionable !== undefined ? { mentionable: input.mentionable } : {}),
			...(color !== undefined ? { color } : {}),
			...(input.hoist !== undefined ? { hoist: input.hoist } : {}),
			...(wanted !== undefined ? { permissions: wanted } : {}),
		});
		// Discord lets two roles share a name, so a second run that listed the roles before this one created
		// the role may have created its own. Look again now: if there are two, say so instead of leaving
		// an unmanaged twin behind for a later run to trip over.
		const twins = (await bot.guilds.roles(this.guild())).filter((r) =>
			DiscordNotifications.same(r.name, input.name)
		);
		if (twins.length > 1) {
			throw new Error(
				`created role \`${input.name}\` (id ${made.id}) but ${twins.length} roles now have that name ` +
					`(ids ${twins.map((r) => r.id).join(", ")}) -- another setup run probably created it at the same time; ` +
					"delete the extra one in Discord and re-run"
			);
		}
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
