// Re-exported from @theholocron/http — the canonical home for HTTP primitives.
// createResolveToken is wrapped here to inject the keyring backend so plugins
// don't need to pass it explicitly.
import { AuthError, createResolveToken as _createResolveToken, type ResolveTokenInput } from "@theholocron/http-client";

import { makeEnv } from "../../env/index.js";
import { getCredential } from "../credential-store/index.js";
import { getToken as getKeyringToken } from "../keyring/index.js";
import type {
	FeatureResolver,
	FeatureResolverConfig,
	ResolveTokenConfig,
	TokenResolver,
} from "./auth-resolver.type.js";

export { AuthError, type ResolveTokenInput };

/** Wraps `createResolveToken` from `@theholocron/http` and injects the
 *  system keyring so plugins stay at a one-liner call site. */
export function createResolveToken(config: ResolveTokenConfig): TokenResolver {
	// The resolver asks this only after the flag and the environment, which is where the `credentials` providers
	// belong: the stored variable of the same name, then the keyring.
	const storedOrKeyring = (provider: string): string | null =>
		getCredential(config.envName, config.vendorEnvName) ?? getKeyringToken(provider);
	return Object.assign(_createResolveToken({ ...config, getKeyringToken: storedOrKeyring }), {
		token: { envName: config.envName, vendorEnvName: config.vendorEnvName, keyringKey: config.keyringService },
	});
}

/**
 * Build a strict, single-feature token resolver.
 *
 * Resolution chain: `--token flag → envName env var → the `credentials` providers' envName → keyring(keyringKey)`.
 * No broad-token fallback — if the feature-specific token is absent the
 * operation fails with a message naming the exact env var to set.
 */
export function createFeatureResolver(config: FeatureResolverConfig): FeatureResolver {
	const resolveFeatureToken = (input: ResolveTokenInput = {}): string => {
		const env = makeEnv(input.env);
		const keyring =
			input.keyring ?? ((provider: string) => getCredential(config.envName) ?? getKeyringToken(provider));
		const token = input.cliToken || env.get(config.envName) || keyring(config.keyringKey);
		if (!token) {
			throw new AuthError(
				`no ${config.vendor ?? "GitHub"} token found for this operation. Pass --token <token>, ` +
					`set ${config.envName}, or run: holocron auth set ${config.keyringKey} <token>`
			);
		}
		return token;
	};
	return Object.assign(resolveFeatureToken, { token: { envName: config.envName, keyringKey: config.keyringKey } });
}
