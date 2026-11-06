import { AuthError } from "../auth-error/index.js";
import { getCredential } from "../credential-store/index.js";
import { firstEnv } from "../first-env/index.js";
import type { ResolveTokenConfig, ResolveTokenInput, TokenResolver } from "./resolve-token.type.js";

/**
 * A function that finds one vendor's token, for a tool to call once at module level.
 *
 * @remarks
 * It tries, in order: `input.cliToken` (the `--token` flag), `envName`, `vendorEnvName`, the variables the `credentials`
 * providers returned (see {@link setCredentials}), the keyring account `<service>.<org>` (only when an org is known),
 * then the account `<service>`. An empty string counts as unset everywhere. It throws {@link AuthError} with
 * `errorMessage` when none has a token. An `input.keyring` replaces the credential store and the keyring together.
 *
 * @example
 * ```ts
 * const resolveToken = createResolveToken({
 *   envName: "MYTOOL_GITHUB_TOKEN",
 *   vendorEnvName: "GITHUB_TOKEN",
 *   keyringService: "github",
 *   errorMessage: "no GitHub token found. Pass --token, or set MYTOOL_GITHUB_TOKEN or GITHUB_TOKEN.",
 *   keyring: (account) => keyring.get(account),
 *   orgEnvName: "MYTOOL_ORG",
 * });
 * ```
 */
export function createResolveToken(config: ResolveTokenConfig): TokenResolver {
	const stored = (account: string): string | null =>
		getCredential(config.envName, config.vendorEnvName) ?? config.keyring?.(account) ?? null;
	return function resolveToken(input: ResolveTokenInput = {}): string {
		const lookup = input.keyring ?? stored;
		const org = input.org ?? (config.orgEnvName ? firstEnv(input.env, config.orgEnvName) : undefined);
		const token =
			input.cliToken ||
			firstEnv(input.env, config.envName, config.vendorEnvName) ||
			(org ? lookup(`${config.keyringService}.${org}`) : null) ||
			lookup(config.keyringService);
		if (!token) throw new AuthError(config.errorMessage);
		return token;
	};
}
