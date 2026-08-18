import { createPostHogClient } from "@theholocron/posthog-client";

export interface VerifyTokenSuccess {
	ok: true;
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

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
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
