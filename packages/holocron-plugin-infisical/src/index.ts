/**
 * `@theholocron/holocron-plugin-infisical` — entrypoint.
 *
 * Implements the `vault` capability against Infisical's REST API.
 * Also exports `verifyToken` + `AUTH_HINT` for `holocron auth`.
 * See README for auth + config docs.
 */

import type { Vault } from "@theholocron/cli";

import { resolveToken, type ResolveTokenInput } from "./auth.js";
import { InfisicalVault, type InfisicalVaultOptions } from "./capabilities/vault.js";
import { InfisicalRestClient } from "./rest.js";

export interface InfisicalPluginOptions extends ResolveTokenInput, InfisicalVaultOptions {
	/** Override base URL for tests (or self-hosted Infisical). */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: InfisicalPluginOptions;
	rest: InfisicalRestClient;
}

export function createContext(options: InfisicalPluginOptions): PluginContext {
	const token = resolveToken(options);
	const restOpts: ConstructorParameters<typeof InfisicalRestClient>[0] = { token };
	if (options.baseUrl !== undefined) restOpts.baseUrl = options.baseUrl;
	if (options.fetch !== undefined) restOpts.fetch = options.fetch;
	return {
		options,
		rest: new InfisicalRestClient(restOpts),
	};
}

export function vault(ctx: PluginContext): Vault {
	return new InfisicalVault(ctx.rest, {
		workspace: ctx.options.workspace,
		environment: ctx.options.environment,
	});
}

export function createPlugin(options: InfisicalPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-infisical",
		capabilities: {
			vault: () => vault(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set infisical` when no
 * token is supplied or the supplied token is rejected. Points
 * operators at Infisical's Universal Auth flow (machine identities
 * are the recommended token type for API use).
 */
export const AUTH_HINT =
	"generate a Universal Auth token in the Infisical dashboard " +
	"(Access Control → Machine Identities), then run: " +
	"holocron auth set infisical <TOKEN>";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { InfisicalRestClient } from "./rest.js";
export { InfisicalVault } from "./capabilities/vault.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenResult, VerifyTokenSuccess, VerifyTokenFailure } from "./verify-token.js";
