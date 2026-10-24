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
}

export interface ModifyWebhookInput {
	name?: string;
	/** A data URI (`data:image/png;base64,...`); `null` clears it. */
	avatar?: string | null;
}
