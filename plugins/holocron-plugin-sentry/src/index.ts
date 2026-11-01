import type { Errors } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveRelayToken, resolveToken, type ResolveTokenInput } from "./auth.js";
import { SentryErrors, type SentryErrorsOptions } from "./capabilities/errors.js";
import { sentryProbes } from "./probes/index.js";
import { createSentryClient, type SentryClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Sentry plugin: token resolution, the organization and team, and test overrides. */
export interface SentryPluginOptions extends ResolveTokenInput, SentryErrorsOptions {
	/**
	 * Sentry organization slug. Optional at load time — the `errors` capability
	 * activates from env vars alone — but required for `whoami` / `ensureProject`
	 * (validated at call time, not construction).
	 */
	org?: string;
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** What the plugin's capabilities share: the options and two lazily built clients. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: SentryPluginOptions;
	/** Builds the Sentry client on first call and reuses it; the token is resolved then, not at plugin load. */
	client: () => SentryClient;
	/** The client for the Comlink relay: its own token (`sentry.comlink`), the general one only as a last resort. */
	relayClient: () => SentryClient;
}

/** Creates the shared context for the given options; no token is resolved until a client is first called. */
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

/** Builds the `errors` capability from a plugin context, using the relay client for the Comlink relay. */
export function errors(ctx: PluginContext): Errors {
	return new SentryErrors(ctx.client, { org: ctx.options.org, team: ctx.options.team }, ctx.relayClient);
}

/** Creates the Sentry plugin: its probes, a `connection` probe and the `errors` capability. */
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

/** One-line hint shown by `holocron auth set sentry` when no token is given or the token is rejected. */
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
