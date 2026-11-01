/** Options for `createDiscordOAuthClient`. */
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

/** The token Discord returns from the OAuth2 token endpoint. */
export interface DiscordOAuthToken {
	/** The access token to send as a bearer. */
	access_token: string;
	/** The token type, `Bearer`. */
	token_type: string;
	/** Seconds until `access_token` stops working. */
	expires_in: number;
	/** The token that can be exchanged for a new access token. */
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
	/** Discord's visibility code: 0 only the member, 1 everyone. */
	visibility?: number;
}

/** The member who signed in, as `GET /users/@me` returns it with their token. */
export interface DiscordOAuthUser {
	/** The Discord user id. */
	id: string;
	/** The account's username. */
	username: string;
	/** The display name, or `null` when the member has none. */
	global_name?: string | null;
}
