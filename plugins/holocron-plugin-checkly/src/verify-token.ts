/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits `GET /v1/accounts`, not `/me` — Checkly
 * has no account-independent "who am I" endpoint, but this one is
 * explicitly `x-checkly-account`-optional (confirmed against the live
 * OpenAPI spec): it lists every account the key can see, which is
 * exactly what verification needs before an account id is even known.
 * `holocron auth set checkly <KEY>` runs before the repo's
 * `holocron.config.ts` (and its configured `accountId`) is in scope at
 * all, so this deliberately doesn't require one.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin — plugin
 * construction requires an already-resolved token, which is exactly
 * what we don't have yet at bootstrap time.
 */

import type { VerifyTokenResult } from "@theholocron/cli";
import { createRestClient } from "@theholocron/cli";
import { errorMessage } from "@theholocron/misc-utils";

interface Account {
	id: string;
	name: string;
}

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

/** Checks a Checkly API key by listing the accounts it can see; resolves to the account names and ids, or the failure message. */
export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const rest = createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.checklyhq.com/v1",
		token,
		vendor: "Checkly",
		...(opts.fetch !== undefined ? { fetch: opts.fetch } : {}),
	});
	try {
		const accounts = await rest.request<Account[]>("/accounts");
		const names = accounts.map((a) => `${a.name} (${a.id})`).join(", ") || "no accounts visible";
		return { ok: true, subject: names };
	} catch (err) {
		return { ok: false, message: errorMessage(err) };
	}
}
