/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits Clerk's `/v1/instance` endpoint, which
 * requires a valid secret key and returns instance metadata (id,
 * environment_type, etc.). Invalid keys → 401.
 *
 * Clerk doesn't have a traditional user-oriented whoami — the "authed
 * entity" is your Clerk INSTANCE, not a user. `/v1/instance` is the
 * canonical "is this secret key valid?" endpoint.
 */

import { createClerkRestClient } from "./rest.js";

export interface VerifyTokenSuccess {
	ok: true;
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

interface InstanceResponse {
	id?: string;
	environment_type?: string; // "development" | "production" | "staging"
	object?: string;
}

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const rest = createClerkRestClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const instance = await rest.request<InstanceResponse>("/instance");
		const env = instance?.environment_type ?? "unknown";
		const id = instance?.id ?? "unknown";
		return { ok: true, subject: `${env} instance ${id}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
