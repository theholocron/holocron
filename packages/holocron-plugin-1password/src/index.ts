/**
 * `@theholocron/holocron-plugin-1password` — entrypoint.
 *
 * Implements the `vault` capability via `op` CLI shell-out. See
 * README for the why-shell-out reasoning + prerequisites.
 */

import type { Vault } from "@theholocron/cli";

import { verifyOpInstalled, type VerifyInput } from "./auth.js";
import { OpVault } from "./capabilities/vault.js";
import { OpShell } from "./shell.js";

export interface OpPluginOptions extends VerifyInput {
	/** 1P vault name items live in. Required. */
	vault: string;
	/** Optional 1P account UUID; passed as `--account` on every op call. */
	account?: string;
}

export interface PluginContext {
	options: OpPluginOptions;
	shell: OpShell;
}

export function createContext(options: OpPluginOptions): PluginContext {
	if (!options.vault) {
		throw new Error("@theholocron/holocron-plugin-1password requires `vault` in options");
	}
	// Fail fast if op isn't installed — better than a mystery error on
	// the first capability call.
	const verifyOpts: VerifyInput = {};
	if (options.spawn !== undefined) verifyOpts.spawn = options.spawn;
	if (options.binary !== undefined) verifyOpts.binary = options.binary;
	verifyOpInstalled(verifyOpts);

	const shellOpts: ConstructorParameters<typeof OpShell>[0] = {};
	if (options.spawn !== undefined) shellOpts.spawn = options.spawn;
	if (options.binary !== undefined) shellOpts.binary = options.binary;
	if (options.account !== undefined) shellOpts.account = options.account;
	return {
		options,
		shell: new OpShell(shellOpts),
	};
}

export function vault(ctx: PluginContext): Vault {
	return new OpVault(ctx.shell, { vault: ctx.options.vault });
}

export function createPlugin(options: OpPluginOptions) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-1password",
		capabilities: {
			vault: () => vault(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron auth set 1password` — 1P doesn't
 * store a token in the holocron keyring; the `op` CLI manages its own
 * auth. Directs the operator to the two paths that actually work.
 */
export const AUTH_HINT =
	"1Password uses the `op` CLI for auth — no bearer token to store. " +
	"On laptop: `op signin` (or the desktop app's biometric flow). " +
	"In CI: set `OP_SERVICE_ACCOUNT_TOKEN` in the workflow env.";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { OpShell } from "./shell.js";
export { OpVault } from "./capabilities/vault.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenResult, VerifyTokenSuccess, VerifyTokenFailure } from "./verify-token.js";
