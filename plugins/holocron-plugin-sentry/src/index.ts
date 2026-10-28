import type { Errors } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveRelayToken, resolveToken, type ResolveTokenInput } from "./auth.js";
import { SentryErrors, type SentryErrorsOptions } from "./capabilities/errors.js";
import { sentryProbes } from "./probes/index.js";
import { createSentryClient, type SentryClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

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
	/** The client for the Comlink relay: its own token (`sentry.comlink`), the general one only as a last resort. */
	relayClient: () => SentryClient;
}

export function createContext(options: SentryPluginOptions): PluginContext {
	let client: SentryClient | undefined;
	let relayClient: SentryClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createSentryClient({
				token: resolveToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
		relayClient: () =>
			(relayClient ??= createSentryClient({
				token: resolveRelayToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

export function errors(ctx: PluginContext): Errors {
	return new SentryErrors(ctx.client, { org: ctx.options.org, team: ctx.options.team }, ctx.relayClient);
}

export function createPlugin(options: SentryPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-sentry",
		probes: {
			...sentryProbes({ org: options.org, client: ctx.relayClient, fetch: options.fetch }),
			connection: connectionProbe({
				provider: "Sentry",
				url: options.baseUrl ?? "https://sentry.io",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
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
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
