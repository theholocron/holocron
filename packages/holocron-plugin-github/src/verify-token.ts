/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits `GET /user` and translates the response
 * into the normalized `VerifyTokenResult` shape.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin — plugin
 * construction requires an already-resolved token, which is exactly
 * what we don't have yet at bootstrap time.
 */

import { createGitHubClient } from "./rest.js";

export interface VerifyTokenSuccess {
	ok: true;
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createGitHubClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const me = await client.user.getCurrentUser();
		const subject = me.login ?? me.email ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
