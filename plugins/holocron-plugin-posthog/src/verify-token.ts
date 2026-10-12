import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";
import { createPostHogClient } from "@theholocron/posthog-client";

export interface VerifyTokenOptions {
	host?: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const client = createPostHogClient({ token, host: opts.host, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const user = await client.users.me();
		return { ok: true, subject: `${user.email} @ ${user.organization.slug}` };
	} catch (err) {
		/* c8 ignore next */
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
