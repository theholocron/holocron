/**
 * GitHub App authentication — a signed App JWT, exchanged for a
 * short-lived installation access token, exchanged for a ready-to-use
 * `GitHubClient`. Web Crypto only (see `pem.ts`), so this runs unchanged
 * on Cloudflare Workers and in Node — no vendor-specific JWT library, no
 * `nodejs_compat` flag.
 *
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app
 * https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
 */

import { ProviderApiError } from "@theholocron/http-client";

import { createGitHubClient, type GitHubClient } from "../index.js";
import type { GitHubClientOptions } from "../utils.js";
import { base64UrlEncode, importRsaPrivateKey } from "./pem.js";

export interface GitHubAppCredentials {
	/** The App's numeric id (not the client id). */
	appId: string;
	/** PEM-encoded RSA private key — PKCS#1 (GitHub's default download format) or PKCS#8, either works. */
	privateKey: string;
}

export interface InstallationAccessToken {
	token: string;
	/** ISO 8601 — installation tokens are short-lived, about an hour. */
	expiresAt: string;
}

const CLOCK_DRIFT_BUFFER_SECONDS = 60;
/** GitHub rejects an App JWT with more than 10 minutes between iat and exp. */
const JWT_LIFETIME_SECONDS = 600;

/**
 * Signs a JWT identifying this App (not a specific installation) — the
 * credential used only to request an installation access token, never
 * to call the REST API directly.
 */
export async function createAppJWT(creds: GitHubAppCredentials, now: number = Date.now()): Promise<string> {
	const key = await importRsaPrivateKey(creds.privateKey);
	const iat = Math.floor(now / 1000) - CLOCK_DRIFT_BUFFER_SECONDS;
	const exp = iat + JWT_LIFETIME_SECONDS;

	const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
	const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ iat, exp, iss: creds.appId })));
	const signingInput = `${header}.${payload}`;

	const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
	return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Exchanges an App JWT for an installation access token — the credential
 * that actually authenticates REST calls, scoped to exactly one
 * installation (D10: never a hardcoded org — the caller supplies which
 * installation, from the webhook payload that triggered this).
 */
export async function getInstallationAccessToken(
	creds: GitHubAppCredentials,
	installationId: number,
	opts: Pick<GitHubClientOptions, "baseUrl" | "fetch"> = {}
): Promise<InstallationAccessToken> {
	const jwt = await createAppJWT(creds);
	const baseUrl = opts.baseUrl ?? "https://api.github.com";
	const fetchImpl = opts.fetch ?? globalThis.fetch;

	const res = await fetchImpl(`${baseUrl}/app/installations/${installationId}/access_tokens`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${jwt}`,
			accept: "application/vnd.github+json",
			"x-github-api-version": "2022-11-28",
		},
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new ProviderApiError(
			`GitHub POST /app/installations/${installationId}/access_tokens → ${res.status}`,
			res.status,
			body
		);
	}
	const json = (await res.json()) as { token: string; expires_at: string };
	return { token: json.token, expiresAt: json.expires_at };
}

/** The whole flow in one call — an already-authenticated `GitHubClient` scoped to one installation. */
export async function createInstallationClient(
	creds: GitHubAppCredentials,
	installationId: number,
	opts: Pick<GitHubClientOptions, "baseUrl" | "fetch"> = {}
): Promise<GitHubClient> {
	const { token } = await getInstallationAccessToken(creds, installationId, opts);
	return createGitHubClient({ token, baseUrl: opts.baseUrl, fetch: opts.fetch });
}
