export class AuthError extends Error {
	override name = "AuthError";
}

export interface ResolveTokenInput {
	/** From `--token` CLI flag. */
	cliToken?: string;
	/** Env vars; passed in for testability. Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv;
	/** Keyring lookup fn; passed in for testability. */
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
	/** Keyring backend — injected by the CLI layer. Defaults to no-op. */
	getKeyringToken?: (provider: string) => string | null;
}

/**
 * Returns a `resolveToken(input?)` function wired to the given env vars
 * and keyring service. Plugins call this once at module level:
 *
 * ```ts
 * export const resolveToken = createResolveToken({
 *   envName: "HOLOCRON_GITHUB_TOKEN",
 *   vendorEnvName: "GITHUB_TOKEN",
 *   keyringService: "github",
 *   errorMessage: "no GitHub token found ...",
 *   getKeyringToken,          // injected from @theholocron/cli
 * });
 * ```
 */
export function createResolveToken(
	config: ResolveTokenConfig,
): (input?: ResolveTokenInput) => string {
	const defaultKeyring = config.getKeyringToken ?? (() => null);
	return function resolveToken(input: ResolveTokenInput = {}): string {
		const env = input.env ?? process.env;
		const keyring = input.keyring ?? defaultKeyring;
		// Bracket access so numeric-prefixed env var names remain syntactically valid.
		const token =
			input.cliToken ||
			env[config.envName] ||
			env[config.vendorEnvName] ||
			keyring(config.keyringService);
		if (!token) {
			throw new AuthError(config.errorMessage);
		}
		return token;
	};
}
