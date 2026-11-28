import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createSlackClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

/** Checks a Slack bot token with `auth.test` and reports the bot user and workspace, or why it was rejected. */
export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createSlackClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const res = await client.auth.test();
		return { ok: true, subject: `${res.user} @ ${res.team}` };
	} catch (err) {
		/* c8 ignore next */
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
