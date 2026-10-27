// Re-exported from @theholocron/http — the canonical home for HTTP primitives.
// createResolveToken is wrapped here to inject the keyring backend so plugins
// don't need to pass it explicitly.
import { AuthError, createResolveToken as _createResolveToken, type ResolveTokenInput } from "@theholocron/http-client";

import { makeEnv } from "../../env/index.js";
import { getToken as getKeyringToken } from "../keyring/index.js";
import type { FeatureResolverConfig, ResolveTokenConfig } from "./auth-resolver.type.js";

export { AuthError, type ResolveTokenInput };

/** Wraps `createResolveToken` from `@theholocron/http` and injects the
 *  system keyring so plugins stay at a one-liner call site. */
export function createResolveToken(config: ResolveTokenConfig): (input?: ResolveTokenInput) => string {
	return _createResolveToken({ ...config, getKeyringToken });
}

/**
 * Build a strict, single-feature token resolver.
 *
 * Resolution chain: `--token flag → envName env var → keyring(keyringKey)`.
 * No broad-token fallback — if the feature-specific token is absent the
 * operation fails with a message naming the exact env var to set.
 */
export function createFeatureResolver(config: FeatureResolverConfig): (input?: ResolveTokenInput) => string {
	return function resolveFeatureToken(input: ResolveTokenInput = {}): string {
		const env = makeEnv(input.env);
		const keyring = input.keyring ?? getKeyringToken;
		const token = input.cliToken || env.get(config.envName) || keyring(config.keyringKey);
		if (!token) {
			throw new AuthError(
				`no ${config.vendor ?? "GitHub"} token found for this operation. Pass --token <token>, ` +
					`set ${config.envName}, or run: holocron auth set ${config.keyringKey} <token>`
			);
		}
		return token;
	};
}
