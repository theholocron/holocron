import type { VerifyTokenResult } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

import { createCloudflareClient } from "./rest.js";

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

/** Checks a Cloudflare API token, first by the token-verify endpoint and otherwise by listing zones; resolves to a description of what it found, or the failure message. */
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
		const zoneList = await client.zones.list();
		const names = zoneList.map((z) => z.name);
		if (names.length === 0) return { ok: true, subject: "no zones visible" };
		const label =
			names.length <= 5 ? names.join(", ") : `${names.slice(0, 5).join(", ")} (+${names.length - 5} more)`;
		return { ok: true, subject: `zones: ${label}` };
	} catch (err) {
		const message = errorMessage(err);
		return { ok: false, message };
	}
}
