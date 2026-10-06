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

import { createNetlifyRestClient } from "./rest.js";

export interface VerifyTokenSuccess {
	ok: true;
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

interface NetlifyUserResponse {
	full_name?: string;
	email?: string;
	id?: string;
}

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const restOpts: { token: string; baseUrl?: string; fetch?: typeof fetch } = { token };
	if (opts.baseUrl !== undefined) restOpts.baseUrl = opts.baseUrl;
	if (opts.fetch !== undefined) restOpts.fetch = opts.fetch;
	const rest = createNetlifyRestClient(restOpts);
	try {
		const user = await rest.request<NetlifyUserResponse>("/user");
		const subject = user?.email ?? user?.full_name ?? user?.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
