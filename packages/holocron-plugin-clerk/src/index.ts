/**
 * `@theholocron/holocron-plugin-clerk` — entrypoint.
 *
 * Implements the `auth` capability against Clerk's Backend REST API.
 * See README for auth + config docs.
 */

import type { Auth } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { ClerkAuth } from "./capabilities/auth.js";
import { ClerkRestClient } from "./rest.js";

export interface ClerkPluginOptions extends ResolveTokenInput {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: ClerkPluginOptions;
	rest: ClerkRestClient;
}

export function createContext(options: ClerkPluginOptions = {}): PluginContext {
	const token = resolveToken(options);
	const restOpts: ConstructorParameters<typeof ClerkRestClient>[0] = { token };
	if (options.baseUrl !== undefined) restOpts.baseUrl = options.baseUrl;
	if (options.fetch !== undefined) restOpts.fetch = options.fetch;
	return {
		options,
		rest: new ClerkRestClient(restOpts),
	};
}

export function auth(ctx: PluginContext): Auth {
	return new ClerkAuth(ctx.rest);
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

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { ClerkRestClient } from "./rest.js";
export { ClerkAuth } from "./capabilities/auth.js";
export { parseWebhook } from "./parse-webhook.js";
