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
	/**
	 * The dataset the token is meant to read (`HOLOCRON_AXIOM_DATASET`). An API token that cannot read the user is asked
	 * about this one, because a token scoped per dataset is refused (403) for any other name.
	 */
	dataset?: string;
}

/** Asked about when no dataset is known: one that does not exist, so a token that may read datasets answers 404. */
const PROBE_DATASET = "holocron-token-check";

/**
 * Checks an Axiom token by fetching the current user; the success subject is `user @` followed by the email, name or id,
 * the failure carries the error message. An API token cannot read the user (403), so then it asks for a dataset: the one
 * the token is meant to read (`dataset`), else one that does not exist. A 200 or a 404 means the token is accepted and
 * may read datasets, and the subject says `API token`; a 403 on the dataset it is meant to read still fails.
 */
export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createAxiomClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const me = await client.user.me();
		const subject = me.email ?? me.emails?.[0] ?? me.name ?? me.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 403) return verifyApiToken(client, opts.dataset);
		/* c8 ignore next -- createRestClient always rejects with an Error */
		const message = errorMessage(err);
		return { ok: false, message };
	}
}

async function verifyApiToken(
	client: ReturnType<typeof createAxiomClient>,
	dataset: string | undefined
): Promise<VerifyTokenResult> {
	try {
		await client.datasets.get(dataset ?? PROBE_DATASET);
		return { ok: true, subject: "API token" };
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 404) return { ok: true, subject: "API token" };
		return { ok: false, message: errorMessage(err) };
	}
}
