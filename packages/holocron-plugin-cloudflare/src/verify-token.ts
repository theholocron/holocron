import { createCloudflareClient } from "./rest.js";

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
	const client = createCloudflareClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });

	// /user/tokens/verify works only for tokens that include User: API Tokens Read
	// — a user-level permission not needed for any capability this plugin provides.
	// Tokens scoped solely to account/zone resources (the normal case) return 401
	// on that endpoint even when fully valid. Try it first as the ideal path, then
	// fall back to GET /zones which every token for this plugin can reach.
	try {
		const result = await client.tokens.verify();
		return { ok: true, subject: `token ${result.id} (${result.status})` };
	} catch {
		// fall through to zone-based verification
	}

	try {
		const zoneList = await client.zones.list({ per_page: 1 });
		const label = zoneList[0]?.name ?? "unknown";
		return { ok: true, subject: `zone: ${label}` };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
