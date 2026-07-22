/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits `GET /v1/workspace` and interprets the
 * response permissively:
 *
 *   - 200 → token is valid AND has workspace-list scope; report the
 *     workspace count + first workspace name.
 *   - 403 → token is valid (authenticated) but doesn't have scope
 *     to list workspaces at the org level. This is normal for
 *     Universal Auth machine-identity tokens that are scoped to a
 *     specific workspace rather than org-wide. Return ok with a
 *     "scope-limited" subject — the operator's `holocron.config.json`
 *     will name the specific workspace + environment the token
 *     actually has access to.
 *   - 401 or other → token is invalid.
 */

import { ProviderApiError } from "@theholocron/cli";

import { createInfisicalClient } from "./rest.js";

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
	const client = createInfisicalClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
	try {
		const { workspaces } = await client.workspaces.list();
		const count = workspaces?.length ?? 0;
		const first = workspaces?.[0];
		const label = first?.name ?? first?.slug ?? "no accessible workspaces";
		return { ok: true, subject: `${count} workspace${count === 1 ? "" : "s"} · first: ${label}` };
	} catch (err) {
		if (err instanceof ProviderApiError && err.status === 403) {
			return {
				ok: true,
				subject: "scope-limited (token valid, can't list workspaces at org level)",
			};
		}
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
