/**
 * `@theholocron/holocron-plugin-doppler` — entrypoint.
 *
 * Implements the `vault` capability against Doppler's REST API. Also
 * exports `verifyToken` + `AUTH_HINT` for `holocron auth`. See README
 * for auth + config docs.
 */

import type { Vault } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { DopplerVault, type DopplerVaultOptions } from "./capabilities/vault.js";
import { createDopplerClient, type DopplerClient } from "./rest.js";

export interface DopplerPluginOptions extends ResolveTokenInput, DopplerVaultOptions {
	/** Override base URL for tests. */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: DopplerPluginOptions;
	client: DopplerClient;
}

export function createContext(options: DopplerPluginOptions): PluginContext {
	const token = resolveToken(options);
	return {
		options,
		client: createDopplerClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function vault(ctx: PluginContext): Vault {
	return new DopplerVault(ctx.client, { project: ctx.options.project, config: ctx.options.config });
}

export function createPlugin(options: DopplerPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-doppler",
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
export { createDopplerClient } from "./rest.js";
export { DopplerVault } from "./capabilities/vault.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenResult, VerifyTokenSuccess, VerifyTokenFailure } from "./verify-token.js";
