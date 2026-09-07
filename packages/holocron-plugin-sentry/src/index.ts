import type { Errors } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { SentryErrors, type SentryErrorsOptions } from "./capabilities/errors.js";
import { createSentryClient, type SentryClient } from "./rest.js";

export interface SentryPluginOptions extends ResolveTokenInput, SentryErrorsOptions {
	/**
	 * Sentry organization slug. Optional at load time — the `errors` capability
	 * activates from env vars alone — but required for `whoami` / `ensureProject`
	 * (validated at call time, not construction).
	 */
	org?: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: SentryPluginOptions;
	client: () => SentryClient;
}

export function createContext(options: SentryPluginOptions): PluginContext {
	let client: SentryClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createSentryClient({
				token: resolveToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

export function errors(ctx: PluginContext): Errors {
	return new SentryErrors(ctx.client, { org: ctx.options.org, team: ctx.options.team });
}

export function createPlugin(options: SentryPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-sentry",
		capabilities: {
			errors: () => errors(ctx),
		},
	};
}

export const AUTH_HINT =
	"generate an auth token at https://sentry.io/settings/account/api/auth-tokens/ " +
	"with project:read, project:write, and org:read scopes, " +
	"then run: holocron auth set sentry <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { SentryErrors, type SentryErrorsOptions } from "./capabilities/errors.js";
export { createSentryClient, type SentryClient, type SentryClientOptions } from "./rest.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
