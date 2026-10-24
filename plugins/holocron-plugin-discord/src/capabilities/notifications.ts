import {
	type EnsuredResource,
	type EnsureWebhookResult,
	type Notifications,
	type NotificationsAccess,
	type NotificationsApplicationLayout,
	type NotificationsEveryoneLayout,
	type NotificationsLayout,
	type NotificationsOnboardingLayout,
	type NotificationsServerLayout,
	type NotificationsWelcomeLayout,
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
	type ModifyApplicationInput,
	type ModifyGuildInput,
	type ModifyRoleInput,
	parseWebhookUrl,
	type PermissionName,
	permissionNames,
	permissions,
} from "../rest.js";

/** Discord's numeric settings, by the names the layout uses. */
const VERIFICATION = { none: 0, low: 1, medium: 2, high: 3, highest: 4 } as const;
const NOTIFICATIONS = { all: 0, mentions: 1 } as const;
const FILTER = { off: 0, noRoles: 1, all: 2 } as const;
const nameOf = <T extends Record<string, number>>(map: T, value: number | undefined): keyof T | undefined =>
	(Object.keys(map) as Array<keyof T>).find((k) => map[k] === value);

/** What the bot needs in the server to do everything `setup` does. The invite link asks for exactly these. */
const BOT_NEEDS: PermissionName[] = [
	"ViewChannel",
	"SendMessages",
	"ReadMessageHistory",
	"ManageChannels",
	"ManageRoles",
	"ManageWebhooks",
	"ManageGuild",
	"CreatePublicThreads",
	"CreatePrivateThreads",
	"SendMessagesInThreads",
];

/** The OAuth2 scopes Discord offers an application, as its own application page lists them. Exact, lower-case. */
const SCOPES = new Set([
	"applications.builds.read",
	"applications.commands",
	"applications.commands.permissions.update",
	"applications.entitlements",
	"applications.store.update",
	"bot",
	"connections",
	"email",
	"gdm.join",
	"guilds",
	"guilds.join",
	"guilds.members.read",
	"identify",
	"messages.read",
	"openid",
	"role_connections.write",
	"rpc",
	"rpc.activities.write",
	"rpc.notifications.read",
	"rpc.screenshare.read",
	"rpc.screenshare.write",
	"rpc.video.read",
	"rpc.video.write",
	"rpc.voice.read",
	"rpc.voice.write",
	"webhook.incoming",
]);

/** The locales Discord accepts for a server's preferred language. */
const LOCALES = new Set([
	"id",
	"da",
	"de",
	"en-GB",
	"en-US",
	"es-ES",
	"es-419",
	"fr",
	"hr",
	"it",
	"lt",
	"hu",
	"nl",
	"no",
	"pl",
	"pt-BR",
	"ro",
	"fi",
	"sv-SE",
	"vi",
	"tr",
	"cs",
	"el",
	"bg",
	"ru",
	"uk",
	"hi",
	"th",
	"zh-CN",
	"ja",
	"zh-TW",
	"ko",
]);

/** "applied a, b; " for the start of a message about a step that stopped part-way, or nothing. */
function appliedPrefix(applied: string[]): string {
	return applied.length > 0 ? `applied ${applied.join(", ")}; but ` : "";
}

/** A layout name to Discord's number, undefined when the layout leaves it out; an unknown name is an error, not an omission. */
function s_<T extends Record<string, number>>(name: (keyof T & string) | undefined, map: T): number | undefined {
	if (name === undefined) return undefined;
	if (!Object.hasOwn(map, name))
		throw new Error(`unknown value ${JSON.stringify(name)}; use one of ${Object.keys(map).join(", ")}`);
	return map[name];
}

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

/**
 * What @everyone loses when a channel is read-only. Only sending: Discord refuses (403) any change to the
 * thread permissions on an existing text channel from a bot whose own role lacks them, and Holonet's
 * does. Members can therefore still start threads in a read-only channel until the bot is given those
 * permissions; see {@link THREAD_BITS} for how channels that already carry them are read.
 */
const POST: PermissionName[] = ["SendMessages"];
/** Thread permissions an earlier version denied. Ignored when comparing, so such a channel is not "custom". */
const THREAD_BITS: PermissionName[] = ["SendMessagesInThreads", "CreatePublicThreads", "CreatePrivateThreads"];
const THREAD_MASK = ~BigInt(permissions(THREAD_BITS));
/** What the bot keeps in a channel it has locked down, so it can still manage it and post. */
const BOT_KEEPS: PermissionName[] = [
	"ViewChannel",
	"SendMessages",
	"ReadMessageHistory",
	"ManageChannels",
	"ManageWebhooks",
];

/**
 * Overwrites as a comparable set: order and the shape of the array do not matter, and the thread
 * permissions are left out (setup does not manage them, so their presence is not a difference).
 */
function overwriteKey(list: readonly DiscordPermissionOverwrite[] | undefined): string {
	return (list ?? [])
		.map((o) => ({ ...o, allow: BigInt(o.allow) & THREAD_MASK, deny: BigInt(o.deny) & THREAD_MASK }))
		.filter((o) => o.allow !== 0n || o.deny !== 0n) // an entry that only held thread permissions says nothing we manage
		.map((o) => `${o.id}:${o.type}:${o.allow}:${o.deny}`)
		.sort()
		.join("|");
}

/**
 * Desired overwrites with the thread permissions of the existing ones laid back in. Discord refuses
 * any change to those from this bot, so a replacement list must carry them over untouched or the
 * whole edit is rejected, even when it changes nothing but what we do manage.
 */
function keepThreadBits(
	desired: DiscordPermissionOverwrite[],
	existing: readonly DiscordPermissionOverwrite[] | undefined
): DiscordPermissionOverwrite[] {
	const threads = ~THREAD_MASK;
	const merged = desired.map((o) => ({ ...o }));
	for (const old of existing ?? []) {
		const allow = BigInt(old.allow) & threads;
		const deny = BigInt(old.deny) & threads;
		if (allow === 0n && deny === 0n) continue;
		const same = merged.find((o) => o.id === old.id && o.type === old.type);
		if (same) {
			same.allow = (BigInt(same.allow) | allow).toString();
			same.deny = (BigInt(same.deny) | deny).toString();
		} else {
			merged.push({ id: old.id, type: old.type, allow: allow.toString(), deny: deny.toString() });
		}
	}
	return merged;
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

let idCounter = 0;
/** A snowflake-shaped id for a new onboarding question or answer, which Discord asks the sender to make. */
const newId = (): string => String(((BigInt(Date.now()) - 1420070400000n) << 22n) + BigInt(idCounter++ % 4096));

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
			let webhookAvatars: string[] = [];
			let webhooksError: string | undefined;
			if (wantsWebhook.has(c.name.toLowerCase())) {
				// One channel's webhook list failing must not discard everything else that was read.
				try {
					const hooks = await bot.channels.webhooks(c.id);
					webhooks = hooks.map((w) => w.name ?? "");
					webhookAvatars = hooks.filter((w) => w.avatar).map((w) => w.name ?? "");
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
				webhookAvatars,
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
		const nameOfChannel = (id: string): string => channels.find((c) => c.id === id)?.name ?? id;
		const channelName = (id: string | null | undefined) => (id ? nameOfChannel(id) : undefined);
		// The server's own settings, only when the layout declares some.
		let server: ServerInspection["server"];
		let serverError: string | undefined;
		if (layout.server) {
			try {
				const guild = await bot.guilds.get(this.guild());
				const verification = nameOf(VERIFICATION, guild.verification_level);
				const defaultNotifications = nameOf(NOTIFICATIONS, guild.default_message_notifications);
				const contentFilter = nameOf(FILTER, guild.explicit_content_filter);
				const systemChannel = channelName(guild.system_channel_id);
				const rulesChannel = channelName(guild.rules_channel_id);
				const updatesChannel = channelName(guild.public_updates_channel_id);
				server = {
					...(verification ? { verification } : {}),
					...(defaultNotifications ? { defaultNotifications } : {}),
					...(contentFilter ? { contentFilter } : {}),
					...(systemChannel ? { systemChannel } : {}),
					...(rulesChannel ? { rulesChannel } : {}),
					...(updatesChannel ? { updatesChannel } : {}),
					community: (guild.features ?? []).includes("COMMUNITY"),
					...(guild.description !== undefined && guild.description !== null
						? { description: guild.description }
						: {}),
					...(guild.preferred_locale ? { locale: guild.preferred_locale } : {}),
				};
			} catch (err) {
				serverError = reason(err);
			}
		}
		// The welcome screen and onboarding, each read only when the layout declares it.
		let welcome: ServerInspection["welcome"];
		let welcomeError: string | undefined;
		if (layout.welcome) {
			try {
				const guild = await bot.guilds.get(this.guild());
				const screen = await this.welcomeScreenOf();
				welcome = {
					enabled: (guild.features ?? []).includes("WELCOME_SCREEN_ENABLED"),
					description: screen.description ?? "",
					channels: (screen.welcome_channels ?? []).map((c) => ({
						channel: nameOfChannel(c.channel_id),
						description: c.description,
						...(c.emoji_name ? { emoji: c.emoji_name } : {}),
					})),
				};
			} catch (err) {
				welcomeError = reason(err);
			}
		}
		let onboarding: ServerInspection["onboarding"];
		let onboardingError: string | undefined;
		if (layout.onboarding) {
			try {
				const found = await bot.guilds.onboarding(this.guild());
				const roleOf = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
				onboarding = {
					enabled: found.enabled,
					defaultChannels: found.default_channel_ids.map(nameOfChannel),
					prompts: found.prompts.map((p) => ({
						title: p.title,
						singleSelect: p.single_select,
						required: p.required,
						options: p.options.map((o) => ({
							title: o.title,
							...(o.description ? { description: o.description } : {}),
							...((o.emoji?.name ?? o.emoji_name) ? { emoji: (o.emoji?.name ?? o.emoji_name)! } : {}),
							channels: (o.channel_ids ?? []).map(nameOfChannel),
							roles: (o.role_ids ?? []).map(roleOf),
						})),
					})),
				};
			} catch (err) {
				onboardingError = reason(err);
			}
		}
		// The bot's application and what everyone may do, each read only when the layout declares it.
		let application: ServerInspection["application"];
		let applicationError: string | undefined;
		if (layout.application) {
			try {
				const app = await bot.application.get();
				const install = app.install_params;
				application = {
					...(app.description ? { description: app.description } : {}),
					tags: app.tags ?? [],
					...(install
						? { install: { scopes: install.scopes, permissions: permissionNames(install.permissions) } }
						: {}),
					...(app.terms_of_service_url ? { termsUrl: app.terms_of_service_url } : {}),
					...(app.privacy_policy_url ? { privacyUrl: app.privacy_policy_url } : {}),
					...(app.role_connections_verification_url
						? { roleConnectionsUrl: app.role_connections_verification_url }
						: {}),
				};
			} catch (err) {
				applicationError = reason(err);
			}
		}
		let everyone: ServerInspection["everyone"];
		let everyoneError: string | undefined;
		if (layout.everyone) {
			try {
				const role = (await bot.guilds.roles(this.guild())).find((r) => r.id === this.guild());
				if (role?.permissions === undefined) throw new Error("the server has no @everyone role to read");
				everyone = { permissions: permissionNames(role.permissions) };
			} catch (err) {
				everyoneError = reason(err);
			}
		}
		// Who can see and post comes from the overwrites already in the channel list: no extra requests.
		const roleName = (id: string): string => roles.find((r) => r.id === id)?.name ?? id;
		found.forEach((entry, i) => {
			entry.access = this.accessOf(text[i]!.permission_overwrites, roleName);
		});
		const categoryAccess: Record<string, Required<NotificationsAccess> | "custom"> = {};
		for (const c of channels.filter((c) => c.type === ChannelType.Category)) {
			categoryAccess[c.name] = this.accessOf(c.permission_overwrites, roleName);
		}
		return {
			categories: [...categoryName.values()],
			categoryAccess,
			...(server ? { server } : {}),
			...(serverError ? { serverError } : {}),
			...(welcome ? { welcome } : {}),
			...(welcomeError ? { welcomeError } : {}),
			...(onboarding ? { onboarding } : {}),
			...(onboardingError ? { onboardingError } : {}),
			...(application ? { application } : {}),
			...(applicationError ? { applicationError } : {}),
			...(everyone ? { everyone } : {}),
			...(everyoneError ? { everyoneError } : {}),
			channels: found,
			roles,
			...(rolesError ? { rolesError } : {}),
		};
	}

	/** Where to re-invite the bot so its role holds what `setup` needs. Re-authorising updates the role in place. */
	private async inviteUrl(names: PermissionName[] = BOT_NEEDS): Promise<string> {
		const url = new URL("https://discord.com/oauth2/authorize");
		url.searchParams.set("client_id", await this.botId());
		url.searchParams.set("scope", "bot");
		url.searchParams.set("permissions", permissions(names));
		url.searchParams.set("guild_id", this.guild());
		return url.toString();
	}

	/** Changing server settings needs Manage Server; an empty edit proves the bot has it without changing anything. */
	async preflight(layout: NotificationsLayout): Promise<void> {
		if (!layout.server) return;
		try {
			await this.bot().guilds.modify(this.guild(), {});
		} catch (err) {
			throw await this.manageServerHint(err);
		}
	}

	/** The one role with this name, or an error saying why not: two would mean granting something to the wrong members. */
	private static pickRole<R extends { id: string; name: string }>(
		roles: readonly R[],
		name: string,
		who: string
	): string {
		const found = roles.filter((r) => DiscordNotifications.same(r.name, name));
		if (found.length === 0)
			throw new Error(`${who} names the role \`${name}\`, which does not exist on the server yet`);
		if (found.length > 1) {
			throw new Error(
				`${who} names the role \`${name}\`, but ${found.length} roles have that name (ids ${found.map((r) => r.id).join(", ")}) -- delete or rename the extras`
			);
		}
		return found[0]!.id;
	}

	/** The one text or announcement channel with this name, or an error saying why not. */
	private static pickChannelId(channels: readonly DiscordChannel[], name: string, who: string): string {
		const named = channels.filter(
			(c) =>
				(c.type === ChannelType.Text || c.type === ChannelType.Announcement) &&
				DiscordNotifications.same(c.name, name)
		);
		if (named.length === 0)
			throw new Error(`${who} name the channel \`${name}\`, which does not exist on the server yet`);
		// Two channels with one name: the setting could land on either, and doctor only compares names.
		if (named.length > 1) {
			throw new Error(
				`${who} name the channel \`${name}\`, but ${named.length} channels have that name (ids ${named.map((c) => c.id).join(", ")}) -- rename one`
			);
		}
		return named[0]!.id;
	}

	/** True for a 403 that is about permissions, not about the bot being unable to see the server at all. */
	private static missingPermissions(err: unknown): err is ProviderApiError {
		return (
			err instanceof ProviderApiError &&
			err.status === 403 &&
			!/Missing Access|\b50001\b/.test(String(err.details))
		);
	}

	/** An invite link, or nothing when building it needs a request that fails: the advice must not depend on one. */
	private async inviteOrNothing(names?: PermissionName[]): Promise<string | undefined> {
		try {
			return await this.inviteUrl(names);
		} catch {
			return undefined;
		}
	}

	/** Turning community on or off needs Administrator, which is more than the bot should keep. */
	private async communityHint(err: unknown, applied: string[], turningOn: boolean): Promise<unknown> {
		// Any 403 here: without Administrator Discord answers this edit with "Missing Access" (50001) as often as
		// with "Missing Permissions" (50013), and the edit is the same either way.
		if (!(err instanceof ProviderApiError && err.status === 403)) return err;
		const link = await this.inviteOrNothing(["Administrator"]);
		const byHand = turningOn
			? "turn them on once in Discord (Server Settings → Enable Community; setup then keeps everything else in line)"
			: "turn them off once in Discord (Server Settings → Community Settings → Disable Community)";
		const viaBot = link
			? `give Holonet Administrator for one run and take it away again afterwards: ${link}`
			: "re-invite Holonet with the Administrator permission for one run, and take it away again afterwards";
		// Discord's own words stay in the message: a refusal because access to the server was lost looks the same as
		// one for a missing permission, so the operator can tell them apart when Holonet already has Administrator.
		return new Error(
			`${appliedPrefix(applied)}turning community features ${turningOn ? "on" : "off"} was refused (Discord said: ${String(err.details).slice(0, 120)}), ` +
				"which means Holonet lacks the Administrator permission it needs for that. " +
				`Either ${byHand}, or ${viaBot}. If Holonet already has Administrator, check that it is still in the server`,
			{ cause: err }
		);
	}

	/** A 403 on a server edit becomes the explanation and the invite link; anything else is passed on as it is. */
	private async manageServerHint(err: unknown): Promise<unknown> {
		if (!DiscordNotifications.missingPermissions(err)) return err;
		const link = await this.inviteOrNothing();
		return new Error(
			"the bot is not allowed to change server settings: its role lacks Manage Server. Re-invite it with the " +
				`permissions setup needs${link ? ` (this updates its role in place): ${link}` : " (this updates its role in place)"}`,
			{ cause: err }
		);
	}

	async ensureServer(settings: NotificationsServerLayout): Promise<{ updated: string[] }> {
		const bot = this.bot();
		const guild = await bot.guilds.get(this.guild());
		const channels = await this.channelList();
		const idOf = (name: string): string => DiscordNotifications.pickChannelId(channels, name, "server settings");
		const patch: ModifyGuildInput = {};
		const updated: string[] = [];
		const set = <K extends keyof ModifyGuildInput>(
			label: string,
			key: K,
			want: ModifyGuildInput[K],
			have: unknown
		) => {
			if (want !== undefined && want !== have) {
				patch[key] = want;
				updated.push(label);
			}
		};
		set("verification", "verification_level", s_(settings.verification, VERIFICATION), guild.verification_level);
		set(
			"defaultNotifications",
			"default_message_notifications",
			s_(settings.defaultNotifications, NOTIFICATIONS),
			guild.default_message_notifications
		);
		set(
			"contentFilter",
			"explicit_content_filter",
			s_(settings.contentFilter, FILTER),
			guild.explicit_content_filter
		);
		set(
			"systemChannel",
			"system_channel_id",
			settings.systemChannel && idOf(settings.systemChannel),
			guild.system_channel_id
		);
		set(
			"rulesChannel",
			"rules_channel_id",
			settings.rulesChannel && idOf(settings.rulesChannel),
			guild.rules_channel_id
		);
		// Discord refuses to set the updates channel on its own while community is off (even to a channel the bot
		// can see and post in), so when community is being turned on it travels with that edit, below.
		const updatesId = settings.updatesChannel ? idOf(settings.updatesChannel) : undefined;
		const updatesChanged = updatesId !== undefined && updatesId !== guild.public_updates_channel_id;
		set("description", "description", settings.description, guild.description ?? "");
		set("locale", "preferred_locale", settings.locale, guild.preferred_locale);

		const features = guild.features ?? [];
		const community = features.includes("COMMUNITY");
		const toggleCommunity = settings.community !== undefined && settings.community !== community;
		// Sent with the community edit whenever community is being turned on and a channel is configured, even if it
		// matched when we first looked: an admin may have changed it since, and the edit is what makes it stick.
		const updatesWithCommunity = updatesId !== undefined && toggleCommunity && settings.community === true;
		const communityAfter = toggleCommunity ? settings.community === true : community;
		if (updatesChanged && !updatesWithCommunity) {
			// Refused by Discord while community is off, whatever the channel: say so before applying anything.
			if (!communityAfter) {
				throw new Error(
					`\`updatesChannel\` can only be set while community features are on, but they are off and the layout does not turn them on -- add \`community: true\` or remove \`updatesChannel\``
				);
			}
			patch.public_updates_channel_id = updatesId;
			updated.push("updatesChannel");
		}

		// Two requests, because community needs Administrator and one refused field rejects a whole edit:
		// sent together, a bot without it would apply nothing. The ordinary settings need only Manage Server.
		const ordinary = async (): Promise<void> => {
			if (Object.keys(patch).length === 0) return;
			let after: Awaited<ReturnType<DiscordBotClient["guilds"]["modify"]>>;
			try {
				after = await bot.guilds.modify(this.guild(), patch);
			} catch (err) {
				throw await this.manageServerHint(err);
			}
			// Discord answers with the server as it now is: say so if a setting did not take.
			const stuck: string[] = (Object.keys(patch) as Array<keyof ModifyGuildInput>).filter((k) => {
				const got = (after as unknown as Record<string, unknown>)[k];
				return patch[k] !== (k === "description" ? (got ?? "") : got);
			});
			if (stuck.length > 0) {
				throw new Error(
					`sent ${stuck.join(", ")} but the server came back different -- Discord may have refused a part of it`
				);
			}
		};
		const toggle = async (): Promise<void> => {
			if (!toggleCommunity) return;
			// Read the features again now: Discord can only replace the whole list, so a stale one would undo
			// whatever another admin changed since the first read.
			const freshGuild = await bot.guilds.get(this.guild());
			const fresh = freshGuild.features ?? [];
			const wanted = settings.community
				? [...new Set([...fresh, "COMMUNITY"])]
				: fresh.filter((f) => f !== "COMMUNITY");
			// Discord validates a community edit as a whole: it wants the rules and updates channels in the very
			// request that turns it on, even when they are already set (answering 400 GUILD_RULES_CHANNEL_REQUIRED
			// otherwise). So send what the layout names, or what the server has now.
			const turningOn = settings.community === true;
			const rulesSent = turningOn
				? (settings.rulesChannel ? idOf(settings.rulesChannel) : freshGuild.rules_channel_id) || undefined
				: undefined;
			const updatesSent = turningOn
				? (updatesWithCommunity ? updatesId : freshGuild.public_updates_channel_id) || undefined
				: undefined;
			let after: Awaited<ReturnType<DiscordBotClient["guilds"]["modify"]>>;
			try {
				after = await bot.guilds.modify(this.guild(), {
					features: wanted,
					...(rulesSent ? { rules_channel_id: rulesSent } : {}),
					...(updatesSent ? { public_updates_channel_id: updatesSent } : {}),
				});
			} catch (err) {
				throw await this.communityHint(err, updated, settings.community === true);
			}
			const nowFeatures = after.features ?? [];
			if (wanted.includes("COMMUNITY") !== nowFeatures.includes("COMMUNITY")) {
				throw new Error(
					`${appliedPrefix(updated)}sent the community feature but the server came back different -- community ` +
						"features need a rules channel, an updates channel, verification of at least low and the content filter on all members"
				);
			}
			// A feature that was there when we asked and is gone now was lost to someone else's change in between.
			// (Turning it off is left out: Discord drops the features that depend on community by itself.)
			if (settings.community) {
				const lost = fresh.filter((f) => f !== "COMMUNITY" && !nowFeatures.includes(f));
				if (lost.length > 0) {
					throw new Error(
						`turned community on, but the server no longer has ${lost.join(", ")} -- another admin may have changed ` +
							"its features at the same time; check Server Settings and re-run"
					);
				}
			}
			if (settings.rulesChannel && rulesSent && after.rules_channel_id !== rulesSent) {
				throw new Error(
					`${appliedPrefix(updated)}turned community on, but the server did not keep ${settings.rulesChannel} as its rules channel`
				);
			}
			if (updatesWithCommunity && after.public_updates_channel_id !== updatesId) {
				throw new Error(
					`${appliedPrefix(updated)}turned community on, but the server did not keep ${settings.updatesChannel} as its updates channel`
				);
			}
			if (updatesWithCommunity && updatesChanged) updated.push("updatesChannel");
			updated.push("community");
		};
		// Turning community off first: Discord refuses a verification below low or a content filter below
		// all members while it is on, so the settings that relax those can only follow it.
		if (toggleCommunity && settings.community === false) {
			await toggle();
			await ordinary();
		} else {
			await ordinary();
			await toggle();
		}
		return { updated };
	}

	/** A 403 on the welcome screen or onboarding becomes the likely reason; anything else is passed on. */
	private static communityFeatureHint(err: unknown, what: string): unknown {
		if (!(err instanceof ProviderApiError && err.status === 403)) return err;
		return new Error(
			`the bot is not allowed to change ${what} (Discord said: ${String(err.details).slice(0, 120)}). ` +
				"It needs Manage Server, and the server needs community features on",
			{ cause: err }
		);
	}

	/** The numeric code Discord puts in the JSON body of an error, or undefined when the body is not that. */
	private static codeOf(err: ProviderApiError): unknown {
		try {
			return (JSON.parse(String(err.details)) as { code?: unknown }).code;
		} catch {
			return undefined;
		}
	}

	/** The welcome screen; a server that never had one answers 404 (10069), which is an empty screen. */
	private async welcomeScreenOf(): Promise<Awaited<ReturnType<DiscordBotClient["guilds"]["welcomeScreen"]>>> {
		try {
			return await this.bot().guilds.welcomeScreen(this.guild());
		} catch (err) {
			if (err instanceof ProviderApiError && err.status === 404 && DiscordNotifications.codeOf(err) === 10069) {
				return { description: null, welcome_channels: [] };
			}
			throw err;
		}
	}

	async ensureWelcome(welcome: NotificationsWelcomeLayout): Promise<{ updated: string[] }> {
		const bot = this.bot();
		const channels = await this.channelList();
		const idOf = (name: string): string => DiscordNotifications.pickChannelId(channels, name, "the welcome screen");
		const wanted = {
			enabled: welcome.enabled ?? true,
			description: welcome.description,
			welcome_channels: welcome.channels.map((c) => ({
				channel_id: idOf(c.channel),
				description: c.description,
				emoji_name: c.emoji ?? null,
				emoji_id: null,
			})),
		};
		const normalise = (
			list: ReadonlyArray<{
				channel_id: string;
				description: string;
				emoji_name?: string | null;
				emoji_id?: string | null;
			}>
		) => JSON.stringify(list.map((c) => [c.channel_id, c.description, c.emoji_name ?? null, c.emoji_id ?? null]));

		let guild: Awaited<ReturnType<DiscordBotClient["guilds"]["get"]>>;
		let screen: Awaited<ReturnType<DiscordBotClient["guilds"]["welcomeScreen"]>>;
		try {
			guild = await bot.guilds.get(this.guild());
			screen = await this.welcomeScreenOf();
		} catch (err) {
			throw DiscordNotifications.communityFeatureHint(err, "the welcome screen");
		}
		const updated: string[] = [];
		if ((guild.features ?? []).includes("WELCOME_SCREEN_ENABLED") !== wanted.enabled) updated.push("enabled");
		if ((screen.description ?? "") !== wanted.description) updated.push("description");
		if (normalise(screen.welcome_channels ?? []) !== normalise(wanted.welcome_channels)) updated.push("channels");
		if (updated.length === 0) return { updated };

		let after: Awaited<ReturnType<DiscordBotClient["guilds"]["modifyWelcomeScreen"]>>;
		try {
			after = await bot.guilds.modifyWelcomeScreen(this.guild(), wanted);
		} catch (err) {
			throw DiscordNotifications.communityFeatureHint(err, "the welcome screen");
		}
		// Discord answers with the screen as it now is: say so if it did not take.
		if (
			(after.description ?? "") !== wanted.description ||
			normalise(after.welcome_channels ?? []) !== normalise(wanted.welcome_channels)
		) {
			throw new Error(
				"sent the welcome screen but it came back different -- Discord may have refused a part of it"
			);
		}
		// The switch is a guild feature, not part of the screen: read it back too.
		const now = await bot.guilds.get(this.guild());
		if ((now.features ?? []).includes("WELCOME_SCREEN_ENABLED") !== wanted.enabled) {
			throw new Error(
				`sent the welcome screen but it is still ${wanted.enabled ? "off" : "on"} -- Discord may have refused the switch`
			);
		}
		return { updated };
	}

	/** An onboarding prompt reduced to what the layout can state, so the server's and the layout's can be compared. */
	private static onboardingKey(
		prompts: ReadonlyArray<{
			type: number;
			in_onboarding: boolean;
			title: string;
			single_select: boolean;
			required: boolean;
			options: ReadonlyArray<{
				title: string;
				description?: string | null;
				channel_ids?: string[];
				role_ids?: string[];
				emoji?: { name?: string | null } | null;
				emoji_name?: string | null;
			}>;
		}>
	): string {
		return JSON.stringify(
			prompts.map((p) => [
				p.type,
				p.in_onboarding,
				p.title,
				p.single_select,
				p.required,
				p.options.map((o) => [
					o.title,
					o.description ?? "",
					[...(o.channel_ids ?? [])].sort(),
					[...(o.role_ids ?? [])].sort(),
					o.emoji?.name ?? o.emoji_name ?? null,
				]),
			])
		);
	}

	async ensureOnboarding(onboarding: NotificationsOnboardingLayout): Promise<{ updated: string[] }> {
		const bot = this.bot();
		const channels = await this.channelList();
		const channelId = (name: string): string => DiscordNotifications.pickChannelId(channels, name, "onboarding");
		const needsRoles = (onboarding.prompts ?? []).some((p) => p.options.some((o) => (o.roles ?? []).length > 0));
		const roles = needsRoles ? await this.roleList() : [];
		const roleId = (name: string): string => DiscordNotifications.pickRole(roles, name, "onboarding");

		let current: Awaited<ReturnType<DiscordBotClient["guilds"]["onboarding"]>>;
		try {
			current = await bot.guilds.onboarding(this.guild());
		} catch (err) {
			throw DiscordNotifications.communityFeatureHint(err, "onboarding");
		}
		const usedIds = new Set<string | undefined>();
		// What the layout leaves out stays as the server has it: the PUT replaces everything, so it must be sent back.
		const prompts =
			onboarding.prompts === undefined
				? current.prompts
				: onboarding.prompts.map((p) => {
						// Discord wants an id on every question and answer: keep the one it has, or make a new one.
						// Each id goes to one item only: a title that repeats gets a new id, not a second copy.
						const had = current.prompts.find((c) => c.title === p.title && !usedIds.has(c.id));
						if (had) usedIds.add(had.id);
						const hadOptions = new Set<string | undefined>();
						return {
							id: had?.id ?? newId(),
							type: 0,
							title: p.title,
							single_select: p.singleSelect ?? false,
							required: p.required ?? false,
							in_onboarding: true,
							options: p.options.map((o) => ({
								id: ((): string => {
									const old = had?.options.find((c) => c.title === o.title && !hadOptions.has(c.id));
									if (old) hadOptions.add(old.id);
									return old?.id ?? newId();
								})(),
								title: o.title,
								description: o.description ?? null,
								channel_ids: (o.channels ?? []).map(channelId),
								role_ids: (o.roles ?? []).map(roleId),
								emoji_name: o.emoji ?? null,
							})),
						};
					});
		const defaultChannels =
			onboarding.defaultChannels === undefined
				? current.default_channel_ids
				: onboarding.defaultChannels.map(channelId);
		const enabled = onboarding.enabled ?? current.enabled;

		const updated: string[] = [];
		if (enabled !== current.enabled) updated.push("enabled");
		if (JSON.stringify([...defaultChannels].sort()) !== JSON.stringify([...current.default_channel_ids].sort())) {
			updated.push("defaultChannels");
		}
		if (DiscordNotifications.onboardingKey(prompts) !== DiscordNotifications.onboardingKey(current.prompts)) {
			updated.push("prompts");
		}
		if (updated.length === 0) return { updated };

		const body = { prompts, default_channel_ids: defaultChannels, enabled, mode: current.mode ?? 0 };
		let after: Awaited<ReturnType<DiscordBotClient["guilds"]["modifyOnboarding"]>>;
		try {
			after = await bot.guilds.modifyOnboarding(this.guild(), body);
		} catch (err) {
			throw DiscordNotifications.communityFeatureHint(err, "onboarding");
		}
		// Discord answers with onboarding as it now is: say so if it did not take.
		if (
			after.enabled !== enabled ||
			JSON.stringify([...after.default_channel_ids].sort()) !== JSON.stringify([...defaultChannels].sort()) ||
			DiscordNotifications.onboardingKey(after.prompts) !== DiscordNotifications.onboardingKey(prompts)
		) {
			throw new Error("sent onboarding but it came back different -- Discord may have refused a part of it");
		}
		return { updated };
	}

	async ensureEveryone(everyone: NotificationsEveryoneLayout): Promise<{ updated: string[] }> {
		const bot = this.bot();
		const role = (await bot.guilds.roles(this.guild())).find((r) => r.id === this.guild());
		if (role?.permissions === undefined) throw new Error("the server has no @everyone role to change");
		const bit = (name: string): bigint => BigInt(permissions([name as PermissionName]));
		const have = BigInt(role.permissions);
		const allow = everyone.allow ?? [];
		const deny = everyone.deny ?? [];
		const want = allow.reduce((acc, n) => acc | bit(n), have);
		const final = deny.reduce((acc, n) => acc & ~bit(n), want);
		if (final === have) return { updated: [] };
		const updated = [...allow.filter((n) => (have & bit(n)) === 0n), ...deny.filter((n) => (have & bit(n)) !== 0n)];
		this.roleLoad = undefined;
		const after = await bot.guilds.modifyRole(this.guild(), role.id, { permissions: String(final) });
		if (after.permissions !== String(final)) {
			throw new Error(
				"sent the @everyone permissions but they came back different -- Discord may have refused a part of it"
			);
		}
		return { updated };
	}

	async ensureApplication(app: NotificationsApplicationLayout): Promise<{ updated: string[] }> {
		const bot = this.bot();
		const current = await bot.application.get();
		// Tags and permission names are compared ignoring case; scopes are exact identifiers. Lists, not joined text.
		const set = (list: readonly string[]) => JSON.stringify([...new Set(list.map((n) => n.toLowerCase()))].sort());
		const exact = (list: readonly string[]) => JSON.stringify([...new Set(list)].sort());
		const urls = [
			["termsUrl", "terms_of_service_url"],
			["privacyUrl", "privacy_policy_url"],
			["roleConnectionsUrl", "role_connections_verification_url"],
		] as const;
		const body: ModifyApplicationInput = {};
		const updated: string[] = [];
		if (app.description !== undefined && (current.description ?? "") !== app.description) {
			body.description = app.description;
			updated.push("description");
		}
		if (app.tags !== undefined && set(current.tags ?? []) !== set(app.tags)) {
			body.tags = app.tags;
			updated.push("tags");
		}
		const install = app.install && {
			scopes: app.install.scopes,
			permissions: permissions(app.install.permissions as PermissionName[]),
		};
		const haveInstall = current.install_params;
		if (
			install &&
			(!haveInstall ||
				exact(haveInstall.scopes) !== exact(install.scopes) ||
				haveInstall.permissions !== install.permissions)
		) {
			body.install_params = install;
			updated.push("install");
		}
		for (const [field, key] of urls) {
			if (app[field] !== undefined && (current[key] ?? "") !== app[field]) {
				body[key] = app[field];
				updated.push(field);
			}
		}
		if (updated.length === 0) return { updated };

		const after = await bot.application.modify(body);
		// Discord answers with the application as it now is, and ignores a field it does not take: say which.
		const stuck = updated.filter((name) => {
			if (name === "description") return (after.description ?? "") !== app.description;
			if (name === "tags") return set(after.tags ?? []) !== set(app.tags!);
			if (name === "install") {
				return (
					!after.install_params ||
					exact(after.install_params.scopes) !== exact(install!.scopes) ||
					after.install_params.permissions !== install!.permissions
				);
			}
			const key = urls.find(([f]) => f === name)![1];
			return (after[key] ?? "") !== app[name as (typeof urls)[number][0]];
		});
		if (stuck.length > 0) {
			throw new Error(
				`sent ${stuck.join(", ")} but Discord did not keep ${stuck.length === 1 ? "it" : "them"} -- ` +
					"it may not accept that field from a bot, so set it in the developer portal"
			);
		}
		return { updated };
	}

	validateLayout(layout: NotificationsLayout): string | undefined {
		const app = layout.application;
		if (app) {
			if (app.description !== undefined && app.description.length > 400) {
				return `application: \`description\` is ${app.description.length} characters; Discord allows up to 400`;
			}
			if (app.tags !== undefined) {
				if (app.tags.length > 5) return `application: ${app.tags.length} tags; Discord allows up to 5`;
				const long = app.tags.find((t) => t.length > 20);
				if (long !== undefined) return `application: the tag ${JSON.stringify(long)} is over 20 characters`;
			}
			for (const [field, url] of [
				["termsUrl", app.termsUrl],
				["privacyUrl", app.privacyUrl],
				["roleConnectionsUrl", app.roleConnectionsUrl],
			] as const) {
				if (url !== undefined && !/^https:\/\//.test(url)) {
					return `application: \`${field}\` ${JSON.stringify(url)} must start with https://`;
				}
			}
			if (app.install) {
				if (app.install.scopes.length === 0)
					return "application: `install.scopes` is empty; the link needs at least `bot`";
				const unknown = app.install.scopes.find((s) => !SCOPES.has(s));
				if (unknown !== undefined) {
					return `application: \`install.scopes\` has ${JSON.stringify(unknown)}, which is not an OAuth2 scope Discord offers (scopes are lower-case, for example bot, applications.commands)`;
				}
				try {
					permissions(app.install.permissions as PermissionName[]);
				} catch (err) {
					return `application: \`install.permissions\`: ${errorMessage(err)}`;
				}
			}
		}
		if (layout.everyone) {
			try {
				permissions([...(layout.everyone.allow ?? []), ...(layout.everyone.deny ?? [])] as PermissionName[]);
			} catch (err) {
				return `everyone: ${errorMessage(err)}`;
			}
		}
		const questions = layout.onboarding?.prompts?.length ?? 0;
		if (questions > 5) return `onboarding: ${questions} questions; Discord allows up to 5`;
		const welcome = layout.welcome;
		if (welcome) {
			if (welcome.description.length > 140) {
				return `welcome: \`description\` is ${welcome.description.length} characters; Discord allows up to 140`;
			}
			if (welcome.channels.length > 5) {
				return `welcome: ${welcome.channels.length} channels; Discord allows up to 5`;
			}
			const long = welcome.channels.find((c) => c.description.length > 50);
			if (long) {
				return `welcome: the description of \`${long.channel}\` is ${long.description.length} characters; Discord allows up to 50`;
			}
		}
		const server = layout.server;
		for (const [field, map] of [
			["verification", VERIFICATION],
			["defaultNotifications", NOTIFICATIONS],
			["contentFilter", FILTER],
		] as const) {
			const value = server?.[field];
			if (value !== undefined && !Object.hasOwn(map, value)) {
				return `server: \`${field}\` is ${JSON.stringify(value)}; use one of ${Object.keys(map).join(", ")}`;
			}
		}
		if (server?.community === false && server.updatesChannel !== undefined) {
			return "server: `updatesChannel` can only be set while community features are on; remove it or set `community: true`";
		}
		if (server?.locale !== undefined && !LOCALES.has(server.locale)) {
			return `server: \`locale\` ${JSON.stringify(server.locale)} is not a locale Discord accepts (for example en-US, en-GB, de, fr)`;
		}
		if (server?.community === true && (server.verification === undefined || server.verification === "none")) {
			return "server: community features need `verification` of at least `low`";
		}
		if (server?.community === true && server.contentFilter !== "all") {
			return 'server: community features need `contentFilter: "all"`';
		}
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

		// Only look up roles when a role is actually named; a read-only channel needs no lookup.
		const named = [...(view === "everyone" ? [] : view), ...(post === "everyone" ? [] : post)];
		const roles = named.length > 0 ? await this.roleList() : [];
		const idOf = (name: string): string => DiscordNotifications.pickRole(roles, name, "access");
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

	/**
	 * Read an access back out of a channel's overwrites, naming roles as the layout does. Only
	 * overwrites of the shape {@link overwritesFor} writes can be read back; anything else
	 * (a role-specific deny, a member overwrite, only some of the posting bits) means the
	 * channel's real access is not something the layout can state, and is reported as `"custom"`
	 * rather than guessed at.
	 */
	private accessOf(
		overwrites: readonly DiscordPermissionOverwrite[] | undefined,
		roleName: (id: string) => string
	): Required<NotificationsAccess> | "custom" {
		const list = overwrites ?? [];
		const managed = permissions(["ViewChannel", ...POST]);
		// The thread permissions are not ours to read or write, so they never make an overwrite "custom".
		const unthreaded = (bits: string) => BigInt(bits) & THREAD_MASK;
		const within = (bits: string) => (unthreaded(bits) & ~BigInt(managed)) === 0n;
		const botSignature = permissions(BOT_KEEPS);

		let everyone: DiscordPermissionOverwrite | undefined;
		const roles: DiscordPermissionOverwrite[] = [];
		for (const o of list) {
			if (o.type === 1) {
				if (o.allow !== botSignature || o.deny !== "0") return "custom";
			} else if (o.id === this.guild()) {
				everyone = o;
			} else {
				roles.push(o);
			}
		}
		if (everyone && (unthreaded(everyone.allow) !== 0n || !within(everyone.deny))) return "custom";
		for (const o of roles) {
			if (unthreaded(o.deny) !== 0n || !within(o.allow)) return "custom";
		}
		const denied = (bit: PermissionName) => everyone !== undefined && permissionNames(everyone.deny).includes(bit);
		const names = (bit: PermissionName) =>
			roles.filter((o) => permissionNames(o.allow).includes(bit)).map((o) => roleName(o.id));
		return {
			view: denied("ViewChannel") ? names("ViewChannel") : "everyone",
			post: denied("SendMessages") ? names("SendMessages") : "everyone",
		};
	}

	/** The server's roles, fetched once and forgotten whenever setup changes a role. */
	private roleLoad?: Promise<Awaited<ReturnType<DiscordBotClient["guilds"]["roles"]>>>;

	private roleList() {
		return (this.roleLoad ??= this.bot()
			.guilds.roles(this.guild())
			.catch((err: unknown) => {
				this.roleLoad = undefined;
				throw err;
			}));
	}

	private guild(): string {
		if (!this.opts.guildId) {
			throw new Error(
				"no Discord server id — set `guildId` in the discord provider options in holocron.config.ts"
			);
		}
		// It goes into URLs, so refuse anything that is not a Discord id.
		if (!/^\d{1,20}$/.test(this.opts.guildId)) {
			throw new Error(
				`\`guildId\` ${JSON.stringify(this.opts.guildId)} is not a Discord server id (digits only)`
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
				await this.modifyChannel(existing, {
					permission_overwrites: keepThreadBits(overwrites, existing.permission_overwrites),
				});
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

	/**
	 * Edit a channel and keep the shared list in step; forget the list if the edit may have half-applied.
	 * Discord answers with the channel as it now is: if the overwrites that come back are not the ones we
	 * sent, something else changed it at the same time, so say so instead of reporting success.
	 */
	private async modifyChannel(
		channel: DiscordChannel,
		patch: Parameters<DiscordBotClient["channels"]["modify"]>[1]
	): Promise<void> {
		let after: DiscordChannel;
		try {
			after = await this.bot().channels.modify(channel.id, patch);
		} catch (err) {
			this.channelLoad = undefined; // may have applied; see createChannel
			throw err;
		}
		if (
			patch.permission_overwrites &&
			overwriteKey(after.permission_overwrites) !== overwriteKey(patch.permission_overwrites)
		) {
			this.channelLoad = undefined;
			throw new Error(
				`\`${channel.name}\`: sent its access but the channel came back different -- ` +
					"another setup run may be changing it at the same time; re-run once it has finished"
			);
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
				patch.permission_overwrites = keepThreadBits(overwrites, existing.permission_overwrites);
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

	async ensureWebhook(input: {
		channel: string;
		name: string;
		category?: string;
		avatar?: string;
	}): Promise<EnsureWebhookResult> {
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
		const hook = existing ?? (await bot.channels.createWebhook(channel.id, { name: input.name }));
		// Discord holds a hash, not the image, so a picture cannot be compared: set it only where there is none.
		const result: EnsureWebhookResult = {
			created: !existing,
			// `url` is only present for webhooks this bot created; otherwise Discord will not say it again.
			...(hook.url ? { url: hook.url } : {}),
		};
		if (input.avatar !== undefined && !hook.avatar) {
			// A failure here must not hide `url`: it is shown once, and the caller still has to store it.
			try {
				await bot.webhooks.modify(hook.id, { avatar: input.avatar });
				result.updated = ["avatar"];
			} catch (err) {
				result.avatarError = reason(err);
			}
		}
		return result;
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
				this.roleLoad = undefined;
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
		this.roleLoad = undefined;
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
