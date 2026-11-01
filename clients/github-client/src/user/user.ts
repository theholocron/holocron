import type { RestClient } from "../utils.js";

/** The authenticated user, with only the fields this client reads. */
export interface GitHubUser {
	/** The user's login. */
	login: string;
	/** The user's display name, or `null` when not set. */
	name: string | null;
	/** The user's public email, or `null` when not set. */
	email: string | null;
}

/** The authenticated user and, for a token that expires, when. */
export interface GitHubUserWithExpiry {
	/** The authenticated user. */
	user: GitHubUser;
	/** When the token stops working, ISO 8601 in UTC. Absent for a token that never expires. */
	expiresAt?: string;
}

/**
 * The expiry GitHub reports in the `github-authentication-token-expiration` header (`2026-11-19 03:46:04 UTC`) as
 * ISO 8601, or `undefined` when the header is missing or is not a date.
 */
export function parseTokenExpiration(header: string | null): string | undefined {
	if (!header) return undefined;
	const time = Date.parse(header.replace(/ UTC$/, "Z").replace(" ", "T"));
	return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

export function user(rest: RestClient) {
	return {
		getCurrentUser: (): Promise<GitHubUser> => rest.request<GitHubUser>("/user"),
		/** The authenticated user plus when the token expires, read from the response header on the same call. */
		async getCurrentUserWithExpiry(): Promise<GitHubUserWithExpiry> {
			let header: string | null = null;
			const me = await rest.request<GitHubUser>("/user", {
				onResponse: (headers) => {
					header = headers.get("github-authentication-token-expiration");
				},
			});
			const expiresAt = parseTokenExpiration(header);
			return expiresAt ? { user: me, expiresAt } : { user: me };
		},
	};
}
