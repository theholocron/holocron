/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits `GET /v2/user` and translates the
 * response into the normalized `VerifyTokenResult` shape.
 */

import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createVercelClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createVercelClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const res = await client.user.get();
		const subject = res?.user?.email ?? res?.user?.username ?? res?.user?.name ?? res?.user?.id ?? "unknown";
		return { ok: true, subject: `user @ ${subject}` };
	} catch (err) {
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
