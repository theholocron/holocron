import { AuthError } from "../auth-error/index.js";
import { getCredential } from "../credential-store/index.js";
import { firstEnv } from "../first-env/index.js";
import type { ResolveTokenInput } from "../resolve-token/index.js";
import type { FeatureResolverConfig, FeatureTokenResolver } from "./feature-resolver.type.js";

/**
 * A strict resolver for one feature's token. It tries `input.cliToken`, then `envName`, then the variable of that name
 * from the `credentials` providers, then the keyring account `keyringKey`. There is no fallback to a broad token: when
 * the feature's own token is absent it throws {@link AuthError} naming the exact variable to set. An `input.keyring`
 * replaces the credential store and the keyring together.
 */
export function createFeatureResolver(config: FeatureResolverConfig): FeatureTokenResolver {
	const stored = (account: string): string | null =>
		getCredential(config.envName) ?? config.keyring?.(account) ?? null;
	return function resolveFeatureToken(input: ResolveTokenInput = {}): string {
		const lookup = input.keyring ?? stored;
		const token = input.cliToken || firstEnv(input.env, config.envName) || lookup(config.keyringKey);
		if (!token) {
			const how = config.setCommand ? `, or run: ${config.setCommand(config.keyringKey)}` : "";
			throw new AuthError(
				`no ${config.vendor} token found for this operation. Pass --token <token>, set ${config.envName}${how}`
			);
		}
		return token;
	};
}
