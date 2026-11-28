/**
 * `@theholocron/holocron-plugin-1password` — entrypoint.
 *
 * Implements the `vault` capability via `op` CLI shell-out. See
 * README for the why-shell-out reasoning + prerequisites.
 */

import type { Credentials, Vault } from "@theholocron/cli";
import { connectionProbe } from "@theholocron/cli";

import { type VerifyInput, verifyOpInstalled } from "./auth.js";
import { OpCredentials } from "./capabilities/credentials.js";
import { OpVault } from "./capabilities/vault.js";
import { exportEnvironmentProbe } from "./probes/export-environment.js";
import { exportEnvironmentDeps } from "./probes/export-environment-deps.js";
import { OpShell } from "./shell.js";
import { verifyToken } from "./verify-token.js";

/** Options for the 1Password plugin: the vault and account to use plus the `op` binary overrides. */
export interface OpPluginOptions extends VerifyInput {
	/**
	 * 1P vault name items live in. Only listing a vault's items needs it; Environments are not in a vault, so a
	 * project that only reads an Environment can leave it out.
	 */
	vault?: string;
	/** The Environment `readSecret` reads a variable from by its bare name; the one an app keeps its secrets in. */
	environment?: string;
	/** Optional 1P account UUID; passed as `--account` on every op call. Useful when several accounts are signed in. */
	account?: string;
	/** The repository root, handed in by the CLI: where `export-environment` writes `.credentials` and finds a layer word's remote. */
	repoRoot?: string;
}

/** Shared state for one 1Password plugin instance: its options and the `op` shell wrapper. */
export interface PluginContext {
	/** The options the plugin was created with. */
	options: OpPluginOptions;
	/** The wrapper that runs `op` commands. */
	shell: OpShell;
}

/** Builds the plugin context; throws when the `op` binary is not installed. */
export function createContext(options: OpPluginOptions): PluginContext {
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

/** Builds the `vault` capability for the configured vault. */
export function vault(ctx: PluginContext): Vault {
	return new OpVault(ctx.shell, {
		...(ctx.options.vault !== undefined ? { vault: ctx.options.vault } : {}),
		...(ctx.options.environment !== undefined ? { environment: ctx.options.environment } : {}),
	});
}

/** Builds the `credentials` capability: the variables of a 1Password Environment, read for the token resolvers. */
export function credentials(ctx: PluginContext): Credentials {
	return new OpCredentials(ctx.shell);
}

/** Creates the 1Password plugin: its `connection` and `export-environment` probes and the `vault` and `credentials` capabilities. */
export function createPlugin(options: OpPluginOptions = {}) {
	const ctx = createContext(options);
	return {
		name: "@theholocron/holocron-plugin-1password",
		probes: {
			// No API host and no token of ours: `op` signs in on its own, so the check is that it is installed and signed in.
			connection: connectionProbe({
				provider: "1Password",
				token: () => "",
				verify: (token) => verifyToken(token, { spawn: options.spawn }),
			}),
			// Moves one Environment's variables into another through a private file, a pipe or the clipboard.
			"export-environment": exportEnvironmentProbe(
				exportEnvironmentDeps(new OpCredentials(ctx.shell), options.repoRoot ?? process.cwd())
			),
		},
		capabilities: {
			vault: () => vault(ctx),
			credentials: () => credentials(ctx),
		},
	};
}

/**
 * One-line hint printed by `holocron new token 1password` — 1P doesn't
 * store a token in the holocron keyring; the `op` CLI manages its own
 * auth. Directs the operator to the two paths that actually work.
 */
export const AUTH_HINT =
	"1Password uses the `op` CLI for auth — no bearer token to store. " +
	"On laptop: `op signin` (or the desktop app's biometric flow). " +
	"In CI: set `OP_SERVICE_ACCOUNT_TOKEN` in the workflow env.";

// ── Public re-exports ────────────────────────────────────────────────

export * from "./auth.js";
export { OpCredentials } from "./capabilities/credentials.js";
export { OpVault } from "./capabilities/vault.js";
export { OpShell } from "./shell.js";
export { verifyToken } from "./verify-token.js";
export type { VerifyTokenFailure, VerifyTokenResult, VerifyTokenSuccess } from "@theholocron/cli";
