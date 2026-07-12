import { getToken as getKeyringToken } from "./keyring.js";

export class AuthError extends Error {
	override name = "AuthError";
}

export interface ResolveTokenInput {
	/** From `--token` CLI flag. */
	cliToken?: string;
	/** Env vars; passed in for testability. Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv;
	/** Keyring lookup fn; passed in for testability. Defaults to `getToken(provider)`. */
	keyring?: (provider: string) => string | null;
}

export interface ResolveTokenConfig {
	/** HOLOCRON_* env var (e.g. `"HOLOCRON_GH_TOKEN"`). */
	envName: string;
	/** Vendor's own env var (e.g. `"GITHUB_TOKEN"`). */
	vendorEnvName: string;
	/** Keyring service key (e.g. `"github"`). */
	keyringService: string;
	/** Full error message shown when no token is found. */
	errorMessage: string;
}

/**
 * Returns a `resolveToken(input?)` function wired to the given env vars
 * and keyring service. Each plugin calls this once at module level:
 *
 * ```ts
 * export const resolveToken = createResolveToken({
 *   envName: "HOLOCRON_GITHUB_TOKEN",
 *   vendorEnvName: "GITHUB_TOKEN",
 *   keyringService: "github",
 *   errorMessage: "no GitHub token found ...",
 * });
 * ```
 */
export function createResolveToken(config: ResolveTokenConfig): (input?: ResolveTokenInput) => string {
	return function resolveToken(input: ResolveTokenInput = {}): string {
		const env = input.env ?? process.env;
		const keyring = input.keyring ?? getKeyringToken;
		// Bracket access so numeric-prefixed slugs (e.g. HOLOCRON_1PASSWORD_TOKEN)
		// remain syntactically valid in generated plugin code.
		const token =
			input.cliToken || env[config.envName] || env[config.vendorEnvName] || keyring(config.keyringService);
		if (!token) {
			throw new AuthError(config.errorMessage);
		}
		return token;
	};
}
