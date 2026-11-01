import { ProviderApiError } from "@theholocron/http-client";

import { DEFAULT_BASE_URL } from "../utils.js";
import type {
	DiscordConnection,
	DiscordOAuthClientOptions,
	DiscordOAuthScope,
	DiscordOAuthToken,
	DiscordOAuthUser,
} from "./oauth.type.js";

const DEFAULT_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Discord OAuth2 for "sign in with Discord": build the link a member follows, trade the code Discord sends
 * back for a token, and read who they are and which accounts they have linked. Used to learn a member's
 * Discord id together with their GitHub account, which Discord has verified.
 *
 * The token endpoints take a form body and the client's own credentials, which `createDiscordBotClient`'s
 * JSON + bot-token client cannot send, so this has its own small transport.
 */
export function createDiscordOAuthClient(opts: DiscordOAuthClientOptions) {
	let base = opts.baseUrl ?? DEFAULT_BASE_URL;
	// A loop, not a regex: CodeQL flags a trailing-slash regex on caller input as polynomial.
	while (base.endsWith("/")) base = base.slice(0, -1);
	const f = opts.fetch ?? globalThis.fetch;
	const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const basic = `Basic ${btoa(`${opts.clientId}:${opts.clientSecret}`)}`;

	async function call<T>(path: string, init: RequestInit): Promise<T> {
		const tag = `Discord ${init.method ?? "GET"} ${path}`;
		let res: Response;
		try {
			res = await f(`${base}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
		} catch (err) {
			const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
			throw new ProviderApiError(`${tag} failed: ${detail}`, 0, undefined);
		}
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new ProviderApiError(`${tag} → ${res.status}`, res.status, body);
		}
		return (await res.json()) as T;
	}

	function form(fields: Record<string, string>): RequestInit {
		return {
			method: "POST",
			headers: {
				authorization: basic,
				"content-type": "application/x-www-form-urlencoded",
				accept: "application/json",
			},
			body: new URLSearchParams(fields).toString(),
		};
	}

	function bearer(accessToken: string): RequestInit {
		return { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } };
	}

	return {
		/**
		 * The page a member opens to approve the application. `state` must be unguessable and checked when
		 * Discord sends the member back (see {@link signOAuthState}). `prompt: "none"` skips the approval
		 * screen for a member who already approved.
		 */
		authorizeUrl: (input: {
			state: string;
			scopes?: readonly DiscordOAuthScope[];
			prompt?: "consent" | "none";
		}) => {
			const url = new URL(opts.authorizeUrl ?? DEFAULT_AUTHORIZE_URL);
			url.searchParams.set("client_id", opts.clientId);
			url.searchParams.set("response_type", "code");
			url.searchParams.set("redirect_uri", opts.redirectUri);
			url.searchParams.set("scope", (input.scopes ?? ["identify", "connections"]).join(" "));
			url.searchParams.set("state", input.state);
			if (input.prompt) url.searchParams.set("prompt", input.prompt);
			return url.toString();
		},
		/** `POST /oauth2/token` — trades the one-use `code` from the redirect for a token. */
		exchangeCode: (code: string) =>
			call<DiscordOAuthToken>(
				"/oauth2/token",
				form({ grant_type: "authorization_code", code, redirect_uri: opts.redirectUri })
			),
		/** `POST /oauth2/token` — a fresh token from a `refresh_token`. */
		refresh: (refreshToken: string) =>
			call<DiscordOAuthToken>(
				"/oauth2/token",
				form({ grant_type: "refresh_token", refresh_token: refreshToken })
			),
		/** `POST /oauth2/token/revoke` — discards a token once it has been used; nothing needs to keep it. */
		revoke: async (token: string): Promise<void> => {
			await call<unknown>("/oauth2/token/revoke", form({ token }));
		},
		/** `GET /users/@me` as the member (needs `identify`). */
		user: (accessToken: string) => call<DiscordOAuthUser>("/users/@me", bearer(accessToken)),
		/** `GET /users/@me/connections` as the member (needs `connections`). */
		connections: (accessToken: string) => call<DiscordConnection[]>("/users/@me/connections", bearer(accessToken)),
	};
}

/** The member-OAuth client returned by `createDiscordOAuthClient`. */
export type DiscordOAuthClient = ReturnType<typeof createDiscordOAuthClient>;

/**
 * The verified connection of one service, or `undefined`. Unverified ones are ignored: anyone can type a
 * GitHub name into their profile, and only a verified link proves they own it. When a member has several
 * of the service, the first verified one wins.
 */
export function findVerifiedConnection(
	connections: readonly DiscordConnection[],
	type: string
): DiscordConnection | undefined {
	return connections.find((c) => c.type === type && c.verified);
}
