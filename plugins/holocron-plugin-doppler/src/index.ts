/**
 * `@theholocron/holocron-plugin-doppler` — entrypoint.
 *
 * Implements the `vault` capability against Doppler's REST API. Also
 * exports `verifyToken` + `AUTH_HINT` for `holocron auth`. See README
 * for auth + config docs.
 */

import type { Vault } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { DopplerVault, type DopplerVaultOptions } from "./capabilities/vault.js";
import { createDopplerClient, type DopplerClient } from "./rest.js";
import { verifyToken } from "./verify-token.js";

/** Options for the Doppler plugin: the token lookup inputs plus the default project and config. */
export interface DopplerPluginOptions extends ResolveTokenInput, DopplerVaultOptions {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

/** Shared state for one Doppler plugin instance: its options and a lazily created client. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: DopplerPluginOptions;
	/** Returns the memoized Doppler client; the token is resolved on the first call, not at plugin load. */
	client: () => DopplerClient;
}

/** Builds the plugin context from its options. */
export function createContext(options: DopplerPluginOptions): PluginContext {
	let client: DopplerClient | undefined;
	return {
		options,
		client: () =>
			(client ??= createDopplerClient({
				token: resolveToken(options),
				baseUrl: options.baseUrl,
				fetch: options.fetch,
			})),
	};
}

/** Builds the `vault` capability for the context's default project and config. */
export function vault(ctx: PluginContext): Vault {
	return new DopplerVault(ctx.client, { project: ctx.options.project, config: ctx.options.config });
}

/** Creates the Doppler plugin: its `connection` probe and the `vault` capability. */
export function createPlugin(options: DopplerPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-doppler",
		probes: {
			connection: connectionProbe({
				provider: "Doppler",
				url: options.baseUrl ?? "https://api.doppler.com",
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
 * One-line hint shown by `holocron auth set doppler` when no token is
 * supplied or when the supplied token is rejected.
 */
export const AUTH_HINT =
	"install the Doppler CLI (`brew install dopplerhq/cli/doppler`), run `doppler login`, then " +
	"`holocron auth set doppler $(doppler configure get token --plain)`";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { DopplerVault } from "./capabilities/vault.js";
export { createDopplerClient, type DopplerClientOptions } from "./rest.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
