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
 *
 * The distinction matters: verifyToken answers "is this a real
 * Infisical token?", not "does it have every possible permission?"
 * — per-capability permission failures surface at the actual read /
 * write / list call sites.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin — plugin
 * construction requires an already-resolved token, which is exactly
 * what we don't have yet at bootstrap time.
 */

import { ProviderApiError } from "@theholocron/cli";

import { InfisicalRestClient } from "./rest.js";

export interface VerifyTokenSuccess {
	ok: true;
	subject: string;
}

export interface VerifyTokenFailure {
	ok: false;
	message: string;
}

export type VerifyTokenResult = VerifyTokenSuccess | VerifyTokenFailure;

interface WorkspaceListResponse {
	workspaces?: Array<{ _id?: string; id?: string; name?: string; slug?: string }>;
}

export interface VerifyTokenOptions {
	baseUrl?: string;
	fetch?: typeof fetch;
}

export async function verifyToken(token: string, opts: VerifyTokenOptions = {}): Promise<VerifyTokenResult> {
	const restOpts: ConstructorParameters<typeof InfisicalRestClient>[0] = { token };
	if (opts.baseUrl !== undefined) restOpts.baseUrl = opts.baseUrl;
	if (opts.fetch !== undefined) restOpts.fetch = opts.fetch;
	const rest = new InfisicalRestClient(restOpts);
	try {
		const res = await rest.request<WorkspaceListResponse>("/v1/workspace");
		const count = res?.workspaces?.length ?? 0;
		const first = res?.workspaces?.[0];
		const label = first?.name ?? first?.slug ?? "no accessible workspaces";
		return { ok: true, subject: `${count} workspace${count === 1 ? "" : "s"} · first: ${label}` };
	} catch (err) {
		// 403 = token authenticates but lacks workspace-list scope
		// (typical for workspace-scoped Universal Auth machine identities).
		// Report ok with a scope-limited subject.
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
