/**
 * `@theholocron/holocron-plugin-clerk` — entrypoint.
 *
 * Implements the `auth` capability against Clerk's Backend REST API.
 * See README for auth + config docs.
 */

import type { Auth } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { ClerkAuth } from "./capabilities/auth.js";
import { type ClerkClient, createClerkClient } from "./rest.js";

export interface ClerkPluginOptions extends ResolveTokenInput {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: ClerkPluginOptions;
	client: ClerkClient;
}

export function createContext(options: ClerkPluginOptions = {}): PluginContext {
	const token = resolveToken(options);
	return {
		options,
		client: createClerkClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function auth(ctx: PluginContext): Auth {
	return new ClerkAuth(ctx.client);
}

export function createPlugin(options: ClerkPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-clerk",
		capabilities: {
			auth: () => auth(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set clerk` when no token
 * is supplied or the supplied token is rejected. Points operators at
 * the Clerk dashboard's API Keys section — MUST be the SECRET key
 * (sk_test_* / sk_live_*), not the publishable key.
 */
export const AUTH_HINT =
	"grab your SECRET key (sk_test_* / sk_live_*) at https://dashboard.clerk.com → API Keys, " +
	"then run: holocron auth set clerk <KEY>. Do NOT use the publishable key.";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { ClerkAuth } from "./capabilities/auth.js";
export { parseWebhook } from "./parse-webhook.js";
export { type ClerkClientOptions, createClerkClient } from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
