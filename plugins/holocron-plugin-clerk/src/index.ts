/**
 * `@theholocron/holocron-plugin-clerk` — entrypoint.
 *
 * Implements the `auth` capability against Clerk's Backend REST API.
 * See README for auth + config docs.
 */

import type { Auth } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { ClerkAuth } from "./capabilities/auth.js";
import { type ClerkClient, createClerkClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Clerk plugin: the token lookup inputs plus test overrides. */
export interface ClerkPluginOptions extends ResolveTokenInput {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** Shared state for one Clerk plugin instance: its options and a lazily created client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: ClerkPluginOptions;
	/** Returns the memoized Clerk client; the token is resolved on the first call, not at plugin load. */
	client: () => ClerkClient;
}

/** Builds the plugin context from its options. */
export function createContext(options: ClerkPluginOptions = {}): PluginContext {
	let client: ClerkClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createClerkClient({
				token: resolveToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

/** Builds the `auth` capability for the context. */
export function auth(ctx: PluginContext): Auth {
	return new ClerkAuth(ctx.client);
}

/** Creates the Clerk plugin: its `connection` probe and the `auth` capability. */
export function createPlugin(options: ClerkPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-clerk",
		probes: {
			connection: connectionProbe({
				provider: "Clerk",
				url: options.baseUrl ?? "https://api.clerk.com",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
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
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
