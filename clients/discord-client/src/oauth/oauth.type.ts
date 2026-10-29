export interface DiscordOAuthClientOptions {
	/** The application's client id (the same as its application id). Not a secret. */
	clientId: string;
	/** The application's client secret, from the developer portal (OAuth2 → Reset Secret). */
	clientSecret: string;
	/** One of the redirect URIs registered on the application; Discord refuses any other. */
	redirectUri: string;
	/** Override the API base for testing. Defaults to https://discord.com/api/v10. */
	baseUrl?: string;
	/** Override the authorize page for testing. Defaults to https://discord.com/oauth2/authorize. */
	authorizeUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Per-request deadline in milliseconds. Defaults to 15000. */
	timeoutMs?: number;
}

/** What a member's token may do: `identify` reads who they are, `connections` reads their linked accounts. */
export type DiscordOAuthScope = "identify" | "connections";

export interface DiscordOAuthToken {
	access_token: string;
	token_type: string;
	/** Seconds until `access_token` stops working. */
	expires_in: number;
	refresh_token?: string;
	/** The scopes granted, space separated. */
	scope: string;
}

/** A linked account on a member's profile, as `GET /users/@me/connections` returns it. */
export interface DiscordConnection {
	/** The id on the other service; for GitHub, the numeric user id. */
	id: string;
	/** The name on the other service; for GitHub, the login. */
	name: string;
	/** The service, lower case: `github`, `twitch`, … */
	type: string;
	/** Whether Discord confirmed the member owns the account. */
	verified: boolean;
	visibility?: number;
}

/** The member who signed in, as `GET /users/@me` returns it with their token. */
export interface DiscordOAuthUser {
	id: string;
	username: string;
	global_name?: string | null;
}
