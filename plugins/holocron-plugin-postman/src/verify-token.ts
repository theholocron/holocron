/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits Postman's `/me` endpoint (returns the
 * authenticated user).
 */

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createPostmanClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createPostmanClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const res = await client.me.get();
		const subject =
			res?.user?.email ?? res?.user?.username ?? res?.user?.fullName ?? String(res?.user?.id ?? "unknown");
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
