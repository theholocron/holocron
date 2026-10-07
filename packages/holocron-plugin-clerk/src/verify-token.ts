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

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createClerkClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createClerkClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const inst = await client.instance.get();
		const env = inst?.environment_type ?? "unknown";
		const id = inst?.id ?? "unknown";
		return { ok: true, subject: `${env} instance ${id}` };
	} catch (err) {
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
