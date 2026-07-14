/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits Neon's `/users/me` endpoint and
 * translates the response into the normalized `VerifyTokenResult`
 * shape.
 */

import { createNeonRestClient } from "./rest.js";

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
	id?: string;
	email?: string;
	name?: string;
	login?: string;
}

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const rest = createNeonRestClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const me = await rest.request<MeResponse>("/users/me");
		const subject = me?.email ?? me?.login ?? me?.name ?? me?.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
