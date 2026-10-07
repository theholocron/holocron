/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits `GET /v3/me` and translates the response
 * into the normalized `VerifyTokenResult` shape.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin — plugin
 * construction requires an already-resolved token, which is exactly
 * what we don't have yet at bootstrap time.
 */

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createDopplerClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createDopplerClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const me = await client.me.get();
		const workplace = me.workplace?.name ?? me.slug ?? "unknown";
		const kind = me.type ?? "token";
		return { ok: true, subject: `${kind} @ ${workplace}` };
	} catch (err) {
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
