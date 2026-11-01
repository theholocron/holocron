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

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createGitHubClient } from "./rest.js";

/** Options for `verifyToken`. */
export interface VerifyTokenOptions {
	/** Overrides the API base URL, for tests. */
	baseUrl?: string;
	/** Overrides `fetch`, for tests. */
	fetch?: typeof fetch;
}

/** Checks a token against `GET /user` and returns who it belongs to, or why it failed. */
export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createGitHubClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const { user: me, expiresAt } = await client.user.getCurrentUserWithExpiry();
		const subject = me.login ?? me.email ?? "unknown";
		return { ok: true, subject: `user @ ${subject}`, ...(expiresAt ? { expiresAt } : {}) };
	} catch (err) {
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
