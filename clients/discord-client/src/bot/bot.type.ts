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
	Text: 0,
	Category: 4,
	Announcement: 5,
	Forum: 15,
} as const;

export interface DiscordUser {
	id: string;
	username: string;
	bot?: boolean;
}

/** A server as `GET /users/@me/guilds` lists it: a summary, not the full guild. */
export interface DiscordUserGuild {
	id: string;
	name: string;
	/** Whether the caller (here, the bot) owns the server. */
	owner: boolean;
	/** The caller's permission bitfield in the server, as a decimal string. */
	permissions?: string;
}

/** Page options for `users.guilds`; Discord allows a `limit` of 1–200; values outside that are clamped. */
export interface ListUserGuildsInput {
	limit?: number;
	/** Return servers after this server id. */
	after?: string;
}

/** Guild fields `guilds.modify` can change; the numeric enums are Discord's own. */
export interface DiscordGuild {
	id: string;
	name: string;
	/** 0 none, 1 low, 2 medium, 3 high, 4 very high. */
	verification_level?: number;
	/** 0 all messages, 1 only @mentions. */
	default_message_notifications?: number;
	/** 0 disabled, 1 members without roles, 2 all members. */
	explicit_content_filter?: number;
	system_channel_id?: string | null;
	/** Bitfield of system-channel messages to suppress. */
	system_channel_flags?: number;
	rules_channel_id?: string | null;
	public_updates_channel_id?: string | null;
	preferred_locale?: string;
	description?: string | null;
	/** `COMMUNITY` here means the community features (welcome screen, onboarding) are available. */
	features?: string[];
}

export interface ModifyGuildInput {
	name?: string;
	/** Hands the server to another user; only the current owner (never a bot that does not own it) may. */
	owner_id?: string;
	verification_level?: number;
	default_message_notifications?: number;
	explicit_content_filter?: number;
	system_channel_id?: string | null;
	system_channel_flags?: number;
	rules_channel_id?: string | null;
	public_updates_channel_id?: string | null;
	preferred_locale?: string;
	description?: string | null;
	/** The full list of mutable guild features (for example `COMMUNITY`); Discord ignores the ones it manages itself. */
	features?: string[];
}

export interface DiscordWelcomeChannel {
	channel_id: string;
	description: string;
	emoji_id?: string | null;
	emoji_name?: string | null;
}

/** Whether the screen is on is the `WELCOME_SCREEN_ENABLED` entry in the guild's `features`; the object has no flag. */
export interface DiscordWelcomeScreen {
	description: string | null;
	welcome_channels: DiscordWelcomeChannel[];
}

export interface ModifyWelcomeScreenInput {
	enabled?: boolean;
	description?: string | null;
	welcome_channels?: DiscordWelcomeChannel[];
}

export interface DiscordEmoji {
	id: string | null;
	name: string | null;
	animated?: boolean;
}

export interface DiscordOnboardingOption {
	id?: string;
	title: string;
	description?: string | null;
	channel_ids?: string[];
	role_ids?: string[];
	/** Discord returns the emoji as an object... */
	emoji?: DiscordEmoji;
	/** ...and takes it as these three fields (a custom emoji has `emoji_id`, a Unicode one only `emoji_name`). */
	emoji_id?: string | null;
	emoji_name?: string | null;
	emoji_animated?: boolean;
}

export interface DiscordOnboardingPrompt {
	id?: string;
	/** 0 multiple choice, 1 dropdown. */
	type: number;
	title: string;
	single_select: boolean;
	required: boolean;
	in_onboarding: boolean;
	options: DiscordOnboardingOption[];
}

export interface DiscordOnboarding {
	guild_id?: string;
	prompts: DiscordOnboardingPrompt[];
	default_channel_ids: string[];
	enabled: boolean;
	/** 0 default, 1 advanced. */
	mode?: number;
}

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

export interface DiscordChannel {
	id: string;
	name: string;
	type: number;
	parent_id?: string | null;
	topic?: string | null;
	position?: number;
	permission_overwrites?: DiscordPermissionOverwrite[];
}

export interface CreateChannelInput {
	name: string;
	type?: number;
	topic?: string;
	parent_id?: string;
	permission_overwrites?: DiscordPermissionOverwrite[];
}

/** `null` clears `topic` or detaches the channel from its category. */
export interface ModifyChannelInput {
	name?: string;
	topic?: string | null;
	parent_id?: string | null;
	permission_overwrites?: DiscordPermissionOverwrite[];
}

/** A member of a server. Only what provisioning needs: who they are and which roles they hold. */
export interface DiscordGuildMember {
	user?: { id: string; username?: string };
	/** Ids of the roles the member holds. */
	roles: string[];
	nick?: string | null;
}

export interface DiscordRole {
	id: string;
	name: string;
	color: number;
	mentionable: boolean;
	hoist?: boolean;
	/** Bitfield of permissions, as a string. */
	permissions?: string;
	managed?: boolean;
	position?: number;
}

export interface ModifyRoleInput {
	name?: string;
	color?: number;
	hoist?: boolean;
	mentionable?: boolean;
	/** Bitfield of permissions, as a string. */
	permissions?: string;
}

export interface CreateRoleInput {
	name: string;
	color?: number;
	mentionable?: boolean;
	hoist?: boolean;
	/** Bitfield of permissions, as a string. */
	permissions?: string;
}

export interface DiscordChannelWebhook {
	id: string;
	name: string | null;
	/** The avatar hash, or `null` for the default one. */
	avatar?: string | null;
	channel_id: string;
	/** Present only on webhooks this application created; Discord omits it otherwise. */
	token?: string;
	/** Present only on webhooks this application created. */
	url?: string;
}

export interface CreateMessageInput {
	content: string;
	/** With `enforce_nonce`, Discord drops a repeat of the same nonce, so a retry after a lost response cannot post twice. */
	nonce?: string | number;
	enforce_nonce?: boolean;
	/** Defaults to no mentions, so a pasted `@everyone` cannot ping anyone. */
	allowed_mentions?: {
		parse?: Array<"roles" | "users" | "everyone">;
		roles?: string[];
		users?: string[];
	};
}

export interface DiscordMessage {
	id: string;
	channel_id: string;
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
	GatewayPresence: 1 << 12,
	GatewayPresenceLimited: 1 << 13,
	GatewayGuildMembers: 1 << 14,
	GatewayGuildMembersLimited: 1 << 15,
	GatewayMessageContent: 1 << 18,
	GatewayMessageContentLimited: 1 << 19,
} as const;

/** The bot's own application, as `GET /applications/@me` returns it. Fields Discord leaves out are absent or null. */
export interface DiscordApplication {
	id: string;
	name: string;
	description?: string | null;
	/** Up to five short labels shown on the application's page. */
	tags?: string[];
	/** The default install link's scopes and permissions. */
	install_params?: DiscordInstallParams;
	/** Used instead of the default install link when set. */
	custom_install_url?: string | null;
	role_connections_verification_url?: string | null;
	terms_of_service_url?: string | null;
	privacy_policy_url?: string | null;
	interactions_endpoint_url?: string | null;
	/** Whether anyone can add the bot (`true`) or only its owner. */
	bot_public?: boolean;
	bot_require_code_grant?: boolean;
	flags?: number;
	/**
	 * The OAuth2 redirect URIs registered on the application. Read-only here: Discord accepts a write to this
	 * field and silently ignores it, so add them in the developer portal (OAuth2 → Redirects).
	 */
	redirect_uris?: string[];
}

/** What `PATCH /applications/@me` takes; a field left out is left alone, and `null` clears the ones that can be cleared. */
export interface ModifyApplicationInput {
	description?: string;
	tags?: string[];
	install_params?: DiscordInstallParams;
	custom_install_url?: string | null;
	role_connections_verification_url?: string | null;
	terms_of_service_url?: string | null;
	privacy_policy_url?: string | null;
	interactions_endpoint_url?: string | null;
	/**
	 * The whole flags value. Discord keeps only the bits an app may change (the `*Limited` privileged-intent
	 * toggles among them), so read `flags` first and send it back with your bit set or cleared.
	 */
	flags?: number;
}

export interface ModifyWebhookInput {
	name?: string;
	/** A data URI (`data:image/png;base64,...`); `null` clears it. */
	avatar?: string | null;
}

/** What `POST /guilds` takes. Only a bot in fewer than ten servers may create one, and it becomes the owner. */
export interface CreateGuildInput {
	name: string;
	/** A data URI (`data:image/png;base64,...`). */
	icon?: string;
	verification_level?: number;
	default_message_notifications?: number;
	explicit_content_filter?: number;
}

/** Page options for `guilds.members`; Discord caps `limit` at 1000. */
export interface ListMembersInput {
	limit?: number;
	/** Return members after this user id. */
	after?: string;
}

export interface DiscordEmoji {
	id: string | null;
	name: string | null;
	animated?: boolean;
	available?: boolean;
}

export interface CreateInviteInput {
	/** Seconds until it expires; `0` never. Discord's default is 86400. */
	max_age?: number;
	/** Uses before it is revoked; `0` unlimited. */
	max_uses?: number;
	temporary?: boolean;
	unique?: boolean;
}

export interface DiscordInvite {
	code: string;
	channel_id?: string;
	uses?: number;
}

/** A message listed back from a channel, with who wrote it. */
export interface DiscordChannelMessage extends DiscordMessage {
	author?: { id: string; username?: string; bot?: boolean };
	webhook_id?: string;
	pinned?: boolean;
}
