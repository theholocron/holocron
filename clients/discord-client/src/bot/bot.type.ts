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

export interface DiscordGuild {
	id: string;
	name: string;
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
	managed?: boolean;
	position?: number;
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
	channel_id: string;
	/** Present only on webhooks this application created; Discord omits it otherwise. */
	token?: string;
	/** Present only on webhooks this application created. */
	url?: string;
}
