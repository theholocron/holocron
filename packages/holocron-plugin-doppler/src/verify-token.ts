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

import { DopplerRestClient } from "./rest.js";

export interface VerifyTokenSuccess {
	ok: true;
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

interface MeResponse {
	/** Token type: "cli", "personal", "service", "service_account". */
	type?: string;
	/** Workplace-level identifier. */
	slug?: string;
	/** Workplace object (present on account-level tokens). */
	workplace?: { name?: string; slug?: string };
	/** Present on user tokens. */
	name?: string;
}

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const restOpts: ConstructorParameters<typeof DopplerRestClient>[0] = { token };
	if (opts.baseUrl !== undefined) restOpts.baseUrl = opts.baseUrl;
	if (opts.fetch !== undefined) restOpts.fetch = opts.fetch;
	const rest = new DopplerRestClient(restOpts);
	try {
		const me = await rest.request<MeResponse>("/me");
		const workplace = me.workplace?.name ?? me.slug ?? "unknown";
		const kind = me.type ?? "token";
		return { ok: true, subject: `${kind} @ ${workplace}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
