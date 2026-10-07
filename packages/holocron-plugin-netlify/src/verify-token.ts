/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits Netlify's `GET /user` (current token's
 * identity) and translates the response into the normalized
 * `VerifyTokenResult` shape.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin — plugin
 * construction requires an already-resolved token, which is exactly
 * what we don't have yet at bootstrap time.
 */

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";
import { createNetlifyClient } from "@theholocron/netlify-client";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createNetlifyClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const user = await client.user.get();
		const subject = user?.email ?? user?.full_name ?? user?.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
