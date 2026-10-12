/**
 * `verifyToken` — plugin-level export used by `holocron auth set axiom`
 * + `holocron auth check`. Hits `GET /v2/user` and translates the
 * response into the normalized `VerifyTokenResult` shape.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin.
 */

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createAxiomClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createAxiomClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const me = await client.user.me();
		const subject = me.email ?? me.emails?.[0] ?? me.name ?? me.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		/* c8 ignore next -- createRestClient always rejects with an Error */
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
