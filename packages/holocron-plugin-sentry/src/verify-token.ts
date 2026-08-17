import { createSentryClient } from "./rest.js";

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
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
