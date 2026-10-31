/**
 * `@theholocron/holocron-plugin-infisical` — entrypoint.
 *
 * Implements the `vault` capability against Infisical's REST API.
 * Also exports `verifyToken` + `AUTH_HINT` for `holocron auth`.
 * See README for auth + config docs.
 */

import type { Vault } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { InfisicalVault, type InfisicalVaultOptions } from "./capabilities/vault.js";
import { createInfisicalClient, type InfisicalClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Infisical plugin: the token lookup inputs plus the default workspace and environment. */
export interface InfisicalPluginOptions extends ResolveTokenInput, InfisicalVaultOptions {
	/** Override base URL for tests (or self-hosted Infisical). */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** Shared state for one Infisical plugin instance: its options and a lazily created client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: InfisicalPluginOptions;
	/** Returns the memoized Infisical client; the token is resolved on the first call, not at plugin load. */
	client: () => InfisicalClient;
}

/** Builds the plugin context from its options. */
export function createContext(options: InfisicalPluginOptions): PluginContext {
	let client: InfisicalClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createInfisicalClient({
				token: resolveToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

/** Builds the `vault` capability for the context's default workspace and environment. */
export function vault(ctx: PluginContext): Vault {
	return new InfisicalVault(ctx.client, {
		workspace: ctx.options.workspace,
		environment: ctx.options.environment,
	});
}

/** Creates the Infisical plugin: its `connection` probe and the `vault` capability. */
export function createPlugin(options: InfisicalPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-infisical",
		probes: {
			connection: connectionProbe({
				provider: "Infisical",
				url: options.baseUrl ?? "https://app.infisical.com",
				fetch: options.fetch,
				token: () => resolveToken(options),
				verify: (token) => verifyToken(token, { baseUrl: options.baseUrl, fetch: options.fetch }),
			}),
		},
		capabilities: {
			vault: () => vault(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set infisical` when no
 * token is supplied or the supplied token is rejected.
 */
export const AUTH_HINT =
	"generate a Token Auth token on your machine identity (organization → " +
	"access control → identities → your identity → add auth method → Token Auth → " +
	"create token) OR a Personal API Token, then: holocron auth set infisical <TOKEN>. " +
	"NOT Universal Auth's Client Secret — that needs a login exchange this plugin doesn't do yet.";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { InfisicalVault } from "./capabilities/vault.js";
export type { InfisicalClient, InfisicalClientOptions } from "./rest.js";
export { createInfisicalClient } from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
