/**
 * `verifyToken` — plugin-level export used by `holocron auth set axiom`
 * + `holocron auth check`. Hits `GET /v2/user` and translates the
 * response into the normalized `VerifyTokenResult` shape.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin.
 */

import { createAxiomClient } from "./rest.js";

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
	const client = createAxiomClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const me = await client.getCurrentUser();
		const subject = me.email ?? me.emails?.[0] ?? me.name ?? me.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		/* c8 ignore next -- createRestClient always rejects with an Error */
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
