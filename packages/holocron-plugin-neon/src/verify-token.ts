/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits Neon's `/users/me` endpoint and
 * translates the response into the normalized `VerifyTokenResult`
 * shape.
 */

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createNeonClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createNeonClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const me = await client.users.me();
		const subject = me?.email ?? me?.login ?? me?.name ?? me?.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
