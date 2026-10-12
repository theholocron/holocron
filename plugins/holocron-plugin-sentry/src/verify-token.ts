import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createSentryClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createSentryClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const orgs = await client.auth.organizations();
		const first = orgs[0];
		return { ok: true, subject: `org: ${first?.slug ?? "unknown"}` };
	} catch (err) {
		/* c8 ignore next */
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
