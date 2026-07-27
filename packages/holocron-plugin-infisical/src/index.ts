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
import { createInfisicalClient, type InfisicalClient } from "./rest.js";

export interface InfisicalPluginOptions extends ResolveTokenInput, InfisicalVaultOptions {
	/** Override base URL for tests (or self-hosted Infisical). */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface PluginContext {
	options: InfisicalPluginOptions;
	client: InfisicalClient;
}

export function createContext(options: InfisicalPluginOptions): PluginContext {
	const token = resolveToken(options);
	return {
		options,
		client: createInfisicalClient({ token, baseUrl: options.baseUrl, fetch: options.fetch }),
	};
}

export function vault(ctx: PluginContext): Vault {
	return new InfisicalVault(ctx.client, {
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
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "./verify-token.js";
export { verifyToken } from "./verify-token.js";
