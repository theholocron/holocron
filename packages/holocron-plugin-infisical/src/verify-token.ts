/**
 * `verifyToken` — plugin-level export used by `holocron auth set` +
 * `holocron auth check`. Hits `GET /v1/workspace`, which returns the
 * list of workspaces the token has access to. This endpoint works
 * for both **Personal Tokens** (user context) AND **Universal Auth
 * machine-identity tokens** — any valid token can list its
 * accessible workspaces. Invalid tokens return 401.
 *
 * Chosen over `/v1/users/me` (which is user-token-only) so the
 * verification path is unified across token types.
 *
 * Kept as a standalone function (not a capability method) so the auth
 * command can call it without initializing the full plugin — plugin
 * construction requires an already-resolved token, which is exactly
 * what we don't have yet at bootstrap time.
 */

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
		const message = err instanceof Error ? err.message : String(err);
		return { ok: false, message };
	}
}
