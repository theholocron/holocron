import { createSlackClient } from "./rest.js";

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
	const client = createSlackClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const res = await client.auth.test();
		return { ok: true, subject: `${res.user} @ ${res.team}` };
	} catch (err) {
		/* c8 ignore next */
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
