/**
 * `verifyToken` — plugin-level export used by `holocron new token axiom`
 * + `holocron check token`. Hits `GET /v2/user` and translates the
 * response into the normalized `VerifyTokenResult` shape.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin.
 */

import { ProviderApiError, type VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createAxiomClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

/** A dataset that does not exist: asking for it tells a token that may read datasets (404) from one that may not (403). */
const PROBE_DATASET = "holocron-token-check";

/**
 * Checks an Axiom token by fetching the current user; the success subject is `user @` followed by the email, name or id,
 * the failure carries the error message. An API token cannot read the user (403), so then it asks for a dataset that
 * does not exist: a 404 means the token is accepted and may read datasets, and the subject says `API token`.
 */
export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createAxiomClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const me = await client.user.me();
		const subject = me.email ?? me.emails?.[0] ?? me.name ?? me.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 403) return verifyApiToken(client);
		/* c8 ignore next -- createRestClient always rejects with an Error */
		const message = errorMessage(err);
		return { ok: false, message };
	}
}

async function verifyApiToken(client: ReturnType<typeof createAxiomClient>): Promise<VerifyTokenResult> {
	try {
		await client.datasets.get(PROBE_DATASET);
		return { ok: true, subject: "API token" };
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 404) return { ok: true, subject: "API token" };
		return { ok: false, message: errorMessage(err) };
	}
}
