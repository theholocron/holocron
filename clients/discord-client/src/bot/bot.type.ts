/** Options for `createDiscordBotClient`. */
export interface DiscordBotClientOptions {
	/** Bot token from the Discord developer portal (Bot → Reset Token). */
	botToken: string;
	/** Override base URL for testing. Defaults to https://discord.com/api/v10. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Per-request deadline in milliseconds. Defaults to 15000. */
	timeoutMs?: number;
	/** Retries after a 429 (rate limit) before giving up. Defaults to 3. */
	maxRetries?: number;
	/** Wait between rate-limit retries; a test seam. Defaults to `setTimeout`. */
	sleep?: (ms: number) => Promise<void>;
}

/** Discord channel `type` values this client creates or reads. */
export const ChannelType = {
	/** A text channel. */
	Text: 0,
	/** A category that groups channels. */
	Category: 4,
	/** An announcement channel. */
	Announcement: 5,
	/** A forum channel. */
	Forum: 15,
} as const;

/** A Discord account, as the API returns it. */
export interface DiscordUser {
	/** The user id. */
	id: string;
	/** The account's username. */
	username: string;
	/** Whether the account is a bot. */
	bot?: boolean;
}

/** A server as `GET /users/@me/guilds` lists it: a summary, not the full guild. */
export interface DiscordUserGuild {
	/** The server id. */
	id: string;
	/** The server name. */
	name: string;
	/** Whether the caller (here, the bot) owns the server. */
	owner: boolean;
	/** The caller's permission bitfield in the server, as a decimal string. */
	permissions?: string;
}

/** Page options for `users.guilds`; Discord allows a `limit` of 1–200; values outside that are clamped. */
export interface ListUserGuildsInput {
	/** How many servers to return, 1 to 200. */
	limit?: number;
	/** Return servers after this server id. */
	after?: string;
}

/** Guild fields `guilds.modify` can change; the numeric enums are Discord's own. */
export interface DiscordGuild {
	/** The server id. */
	id: string;
	/** The server name. */
	name: string;
	/** 0 none, 1 low, 2 medium, 3 high, 4 very high. */
	verification_level?: number;
	/** 0 all messages, 1 only @mentions. */
	default_message_notifications?: number;
	/** 0 disabled, 1 members without roles, 2 all members. */
	explicit_content_filter?: number;
	/** Id of the channel for system messages, or `null` for none. */
	system_channel_id?: string | null;
	/** Bitfield of system-channel messages to suppress. */
	system_channel_flags?: number;
	/** Id of the rules channel, or `null` for none. */
	rules_channel_id?: string | null;
	/** Id of the channel for Discord's community updates, or `null` for none. */
	public_updates_channel_id?: string | null;
	/** The server's preferred locale, such as `en-US`. */
	preferred_locale?: string;
	/** The server description, or `null` when unset. */
	description?: string | null;
	/** `COMMUNITY` here means the community features (welcome screen, onboarding) are available. */
	features?: string[];
}

/** What `PATCH /guilds/{id}` takes; a field left out is left alone. */
export interface ModifyGuildInput {
	/** A new server name. */
	name?: string;
	/** Hands the server to another user; only the current owner (never a bot that does not own it) may. */
	owner_id?: string;
	/** Verification level: 0 none, 1 low, 2 medium, 3 high, 4 very high. */
	verification_level?: number;
	/** Notification default: 0 all messages, 1 only @mentions. */
	default_message_notifications?: number;
	/** Content filter: 0 disabled, 1 members without roles, 2 all members. */
	explicit_content_filter?: number;
	/** Id of the channel for system messages, or `null` for none. */
	system_channel_id?: string | null;
	/** Bitfield of system-channel messages to suppress. */
	system_channel_flags?: number;
	/** Id of the rules channel, or `null` for none. */
	rules_channel_id?: string | null;
	/** Id of the channel for Discord's community updates, or `null` for none. */
	public_updates_channel_id?: string | null;
	/** The server's preferred locale, such as `en-US`. */
	preferred_locale?: string;
	/** The server description, or `null` to clear it. */
	description?: string | null;
	/** The full list of mutable guild features (for example `COMMUNITY`); Discord ignores the ones it manages itself. */
	features?: string[];
}

/** A channel featured on a server's welcome screen. */
export interface DiscordWelcomeChannel {
	/** Id of the featured channel. */
	channel_id: string;
	/** The blurb shown beside the channel. */
	description: string;
	/** Id of a custom emoji shown beside it, or `null`. */
	emoji_id?: string | null;
	/** Name of a Unicode emoji shown beside it, or `null`. */
	emoji_name?: string | null;
}

/** Whether the screen is on is the `WELCOME_SCREEN_ENABLED` entry in the guild's `features`; the object has no flag. */
export interface DiscordWelcomeScreen {
	/** The server description shown on the screen, or `null`. */
	description: string | null;
	/** The channels featured on the screen. */
	welcome_channels: DiscordWelcomeChannel[];
}

/** What `PATCH /guilds/{id}/welcome-screen` takes. */
export interface ModifyWelcomeScreenInput {
	/** Whether to turn the welcome screen on or off. */
	enabled?: boolean;
	/** New welcome-screen description, or `null` to clear it. */
	description?: string | null;
	/** The channels to feature on the welcome screen. */
	welcome_channels?: DiscordWelcomeChannel[];
}

/** A server emoji; `id` is `null` for a standard Unicode emoji. */
export interface DiscordEmoji {
	/** The emoji id, or `null` for a Unicode emoji. */
	id: string | null;
	/** The emoji name (the Unicode character for a standard emoji), or `null`. */
	name: string | null;
	/** Whether the emoji is animated. */
	animated?: boolean;
}

/** One answer a member can pick in an onboarding prompt. */
export interface DiscordOnboardingOption {
	/** The option id; absent when creating a new option. */
	id?: string;
	/** The text of the option. */
	title: string;
	/** A short explanation shown under the title. */
	description?: string | null;
	/** Ids of the channels a member who picks this option is shown. */
	channel_ids?: string[];
	/** Ids of the roles a member who picks this option is given. */
	role_ids?: string[];
	/** Discord returns the emoji as an object... */
	emoji?: DiscordEmoji;
	/** ...and takes it as these three fields (a custom emoji has `emoji_id`, a Unicode one only `emoji_name`). */
	emoji_id?: string | null;
	/** Name of a Unicode emoji, or of a custom emoji together with `emoji_id`. */
	emoji_name?: string | null;
	/** Whether the custom emoji is animated. */
	emoji_animated?: boolean;
}

/** A question in the server's onboarding flow, with the options a member picks from. */
export interface DiscordOnboardingPrompt {
	/** The prompt id; absent when creating a new prompt. */
	id?: string;
	/** 0 multiple choice, 1 dropdown. */
	type: number;
	/** The question text. */
	title: string;
	/** Whether a member may pick only one option. */
	single_select: boolean;
	/** Whether a member must answer. */
	required: boolean;
	/** Whether the prompt appears during onboarding (otherwise only in Channels & Roles). */
	in_onboarding: boolean;
	/** The answers a member can choose from. */
	options: DiscordOnboardingOption[];
}

/** A server's onboarding configuration, as `GET /guilds/{id}/onboarding` returns and `PUT` takes it. */
export interface DiscordOnboarding {
	/** The server id. */
	guild_id?: string;
	/** The questions asked during onboarding. */
	prompts: DiscordOnboardingPrompt[];
	/** Ids of the channels every new member is shown by default. */
	default_channel_ids: string[];
	/** Whether onboarding is turned on. */
	enabled: boolean;
	/** 0 default, 1 advanced. */
	mode?: number;
}

/** A per-role or per-member override of a channel's permissions. */
export interface DiscordPermissionOverwrite {
	/** Role or user id. */
	id: string;
	/** 0 = role, 1 = member. */
	type: 0 | 1;
	/** Bitfield of permissions to allow, as a string. */
	allow: string;
	/** Bitfield of permissions to deny, as a string. */
	deny: string;
}

/** A channel or category in a server, as Discord returns it. */
export interface DiscordChannel {
	/** The channel id. */
	id: string;
	/** The channel name. */
	name: string;
	/** The channel type; see `ChannelType`. */
	type: number;
	/** Id of the category the channel sits in, or `null` for none. */
	parent_id?: string | null;
	/** The channel topic, or `null` when unset. */
	topic?: string | null;
	/** The channel's sort position within its category or the server. */
	position?: number;
	/** Permission overrides set on this channel. */
	permission_overwrites?: DiscordPermissionOverwrite[];
}

/** What `POST /guilds/{id}/channels` takes. */
export interface CreateChannelInput {
	/** The channel name. */
	name: string;
	/** The channel type; see `ChannelType`. Discord creates a text channel when omitted. */
	type?: number;
	/** The channel topic. */
	topic?: string;
	/** Id of the category to create the channel in. */
	parent_id?: string;
	/** Permission overrides to set on the new channel. */
	permission_overwrites?: DiscordPermissionOverwrite[];
}

/** `null` clears `topic` or detaches the channel from its category. */
export interface ModifyChannelInput {
	/** A new channel name. */
	name?: string;
	/** A new topic. */
	topic?: string | null;
	/** Id of the category to move the channel into. */
	parent_id?: string | null;
	/** The full list of permission overrides, replacing the existing ones. */
	permission_overwrites?: DiscordPermissionOverwrite[];
}

/** A member of a server. Only what provisioning needs: who they are and which roles they hold. */
export interface DiscordGuildMember {
	/** The member's account; Discord leaves it out in some message contexts. */
	user?: {
		/** The user id. */
		id: string;
		/** The account's username. */
		username?: string;
	};
	/** Ids of the roles the member holds. */
	roles: string[];
	/** The member's nickname in the server, or `null` when none is set. */
	nick?: string | null;
}

/** A role in a server, as Discord returns it. */
export interface DiscordRole {
	/** The role id. */
	id: string;
	/** The role name. */
	name: string;
	/** The role colour as an integer RGB value; `0` means no colour. */
	color: number;
	/** Whether anyone can @mention the role. */
	mentionable: boolean;
	/** Whether members with the role are listed separately in the member list. */
	hoist?: boolean;
	/** Bitfield of permissions, as a string. */
	permissions?: string;
	/** Whether an integration (such as a bot) manages the role. */
	managed?: boolean;
	/** The role's position in the role hierarchy. */
	position?: number;
}

/** Role fields `PATCH /guilds/{id}/roles/{id}` can change; a field left out is left alone. */
export interface ModifyRoleInput {
	/** A new role name. */
	name?: string;
	/** A new colour as an integer RGB value. */
	color?: number;
	/** Whether to list the role's members separately. */
	hoist?: boolean;
	/** Whether anyone can @mention the role. */
	mentionable?: boolean;
	/** Bitfield of permissions, as a string. */
	permissions?: string;
}

/** What `POST /guilds/{id}/roles` takes. */
export interface CreateRoleInput {
	/** The role name. */
	name: string;
	/** The colour as an integer RGB value. */
	color?: number;
	/** Whether anyone can @mention the role. */
	mentionable?: boolean;
	/** Whether to list the role's members separately. */
	hoist?: boolean;
	/** Bitfield of permissions, as a string. */
	permissions?: string;
}

/** A webhook attached to a channel, as the bot API returns it. */
export interface DiscordChannelWebhook {
	/** The webhook id. */
	id: string;
	/** The webhook name, or `null` when unset. */
	name: string | null;
	/** The avatar hash, or `null` for the default one. */
	avatar?: string | null;
	/** Id of the channel the webhook posts to. */
	channel_id: string;
	/** Present only on webhooks this application created; Discord omits it otherwise. */
	token?: string;
	/** Present only on webhooks this application created. */
	url?: string;
}

/** What `POST /channels/{id}/messages` takes. */
export interface CreateMessageInput {
	/** The message text. */
	content: string;
	/** With `enforce_nonce`, Discord drops a repeat of the same nonce, so a retry after a lost response cannot post twice. */
	nonce?: string | number;
	/** Turns on the nonce de-duplication for `nonce`. */
	enforce_nonce?: boolean;
	/** Defaults to no mentions, so a pasted `@everyone` cannot ping anyone. */
	allowed_mentions?: {
		/** Which mention types Discord may resolve into pings. */
		parse?: Array<"roles" | "users" | "everyone">;
		/** Ids of the roles that may be pinged. */
		roles?: string[];
		/** Ids of the users that may be pinged. */
		users?: string[];
	};
}

/** A message that was posted, as Discord returns it. */
export interface DiscordMessage {
	/** The message id. */
	id: string;
	/** Id of the channel the message is in. */
	channel_id: string;
	/** The message text. */
	content: string;
}

/** How the bot is added to a server or an account. */
export interface DiscordInstallParams {
	/** OAuth scopes, e.g. `bot`, `applications.commands`. */
	scopes: string[];
	/** Permission bitfield the default install link asks for, as a string. */
	permissions: string;
}

/**
 * Bits of the application's `flags`. The `*Limited` ones are the portal's privileged-intent toggles for an app
 * that Discord has not verified; once verified, the plain ones take over and the toggle is Discord's to change.
 */
export const ApplicationFlag = {
	/** Application may receive presence updates (verified apps). */
	GatewayPresence: 1 << 12,
	/** The privileged presence intent toggle for an unverified app. */
	GatewayPresenceLimited: 1 << 13,
	/** Application may receive server-member events and the member list (verified apps). */
	GatewayGuildMembers: 1 << 14,
	/** The privileged server-members intent toggle for an unverified app. */
	GatewayGuildMembersLimited: 1 << 15,
	/** Application may read message content (verified apps). */
	GatewayMessageContent: 1 << 18,
	/** The privileged message-content intent toggle for an unverified app. */
	GatewayMessageContentLimited: 1 << 19,
} as const;

/** The bot's own application, as `GET /applications/@me` returns it. Fields Discord leaves out are absent or null. */
export interface DiscordApplication {
	/** The application id. */
	id: string;
	/** The application name. */
	name: string;
	/** The description shown on the application's page. */
	description?: string | null;
	/** Up to five short labels shown on the application's page. */
	tags?: string[];
	/** The default install link's scopes and permissions. */
	install_params?: DiscordInstallParams;
	/** Used instead of the default install link when set. */
	custom_install_url?: string | null;
	/** URL Discord uses for linked-role verification. */
	role_connections_verification_url?: string | null;
	/** URL of the application's terms of service. */
	terms_of_service_url?: string | null;
	/** URL of the application's privacy policy. */
	privacy_policy_url?: string | null;
	/** URL Discord sends interaction events to. */
	interactions_endpoint_url?: string | null;
	/** Whether anyone can add the bot (`true`) or only its owner. */
	bot_public?: boolean;
	/** Whether the bot is only added after the full OAuth2 code grant. */
	bot_require_code_grant?: boolean;
	/** The application flags bitfield; see `ApplicationFlag`. */
	flags?: number;
	/**
	 * The OAuth2 redirect URIs registered on the application. Read-only here: Discord accepts a write to this
	 * field and silently ignores it, so add them in the developer portal (OAuth2 → Redirects).
	 */
	redirect_uris?: string[];
}

/** What `PATCH /applications/@me` takes; a field left out is left alone, and `null` clears the ones that can be cleared. */
export interface ModifyApplicationInput {
	/** A new description. */
	description?: string;
	/** The new tags (at most five). */
	tags?: string[];
	/** The new default install link scopes and permissions. */
	install_params?: DiscordInstallParams;
	/** A custom install URL, or `null` to use the default link. */
	custom_install_url?: string | null;
	/** The linked-role verification URL, or `null` to clear it. */
	role_connections_verification_url?: string | null;
	/** The terms of service URL, or `null` to clear it. */
	terms_of_service_url?: string | null;
	/** The privacy policy URL, or `null` to clear it. */
	privacy_policy_url?: string | null;
	/** The interactions endpoint URL, or `null` to clear it. */
	interactions_endpoint_url?: string | null;
	/**
	 * The whole flags value. Discord keeps only the bits an app may change (the `*Limited` privileged-intent
	 * toggles among them), so read `flags` first and send it back with your bit set or cleared.
	 */
	flags?: number;
}

/** What `PATCH /webhooks/{id}` takes; a field left out is left alone. */
export interface ModifyWebhookInput {
	/** A new webhook name. */
	name?: string;
	/** A data URI (`data:image/png;base64,...`); `null` clears it. */
	avatar?: string | null;
}

/** What `POST /guilds` takes. Only a bot in fewer than ten servers may create one, and it becomes the owner. */
export interface CreateGuildInput {
	/** The server name. */
	name: string;
	/** A data URI (`data:image/png;base64,...`). */
	icon?: string;
	/** Verification level, using the same values as `DiscordGuild.verification_level`. */
	verification_level?: number;
	/** Default notification setting, using the same values as `DiscordGuild.default_message_notifications`. */
	default_message_notifications?: number;
	/** Content filter level, using the same values as `DiscordGuild.explicit_content_filter`. */
	explicit_content_filter?: number;
}

/** Page options for `guilds.members`; Discord caps `limit` at 1000. */
export interface ListMembersInput {
	/** How many members to return; Discord caps it at 1000. */
	limit?: number;
	/** Return members after this user id. */
	after?: string;
}

export interface DiscordEmoji {
	id: string | null;
	name: string | null;
	animated?: boolean;
	/** Whether the emoji can be used (it may be unavailable when the server lost a boost level). */
	available?: boolean;
}

/** What `POST /channels/{id}/invites` takes. */
export interface CreateInviteInput {
	/** Seconds until it expires; `0` never. Discord's default is 86400. */
	max_age?: number;
	/** Uses before it is revoked; `0` unlimited. */
	max_uses?: number;
	/** Whether the invite grants temporary membership. */
	temporary?: boolean;
	/** Whether to always create a new invite instead of reusing a similar one. */
	unique?: boolean;
}

/** A server invite, as Discord returns it. */
export interface DiscordInvite {
	/** The invite code, the part after `discord.gg/`. */
	code: string;
	/** Id of the channel the invite leads to. */
	channel_id?: string;
	/** How many times the invite has been used. */
	uses?: number;
}

/** A message listed back from a channel, with who wrote it. */
export interface DiscordChannelMessage extends DiscordMessage {
	/** Who wrote the message; absent when Discord omits it. */
	author?: {
		/** The author's user id. */
		id: string;
		/** The author's username. */
		username?: string;
		/** Whether the author is a bot. */
		bot?: boolean;
	};
	/** Id of the webhook that posted the message, when one did. */
	webhook_id?: string;
	/** Whether the message is pinned in its channel. */
	pinned?: boolean;
}
