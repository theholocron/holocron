/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits Infisical's `/v1/users/me` endpoint,
 * which returns the authenticated user identity for a valid token
 * and 401 for an invalid one.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin — plugin
 * construction requires an already-resolved token, which is exactly
 * what we don't have yet at bootstrap time.
 *
 * For **machine identity** tokens (the Universal Auth flow Infisical
 * recommends for API use), `/v1/users/me` may return 403 rather than
 * 200 since machine identities aren't user records. The subject will
 * still fall through to the token type + error message; the token
 * itself is functionally valid for capability calls. If you want a
 * cleaner machine-identity whoami, swap the endpoint for
 * `/v1/auth/token/renew` (Universal Auth) or `/v1/identity/{id}`.
 */

import { InfisicalRestClient } from "./rest.js";

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
	user?: {
		email?: string;
		firstName?: string;
		lastName?: string;
		username?: string;
	};
	/** Present on machine-identity tokens rather than user tokens. */
	identity?: { name?: string; id?: string };
}

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const restOpts: ConstructorParameters<typeof InfisicalRestClient>[0] = { token };
	if (opts.baseUrl !== undefined) restOpts.baseUrl = opts.baseUrl;
	if (opts.fetch !== undefined) restOpts.fetch = opts.fetch;
	const rest = new InfisicalRestClient(restOpts);
	try {
		const res = await rest.request<MeResponse>("/v1/users/me");
		const subject =
			res?.user?.email ?? res?.user?.username ?? res?.identity?.name ?? res?.identity?.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
