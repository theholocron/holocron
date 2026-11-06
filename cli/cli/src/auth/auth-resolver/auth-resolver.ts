import {
	AuthError,
	createFeatureResolver as createKyberFeatureResolver,
	createResolveToken as createKyberResolveToken,
	type ResolveTokenInput,
} from "@theholocron/kyber/secrets";

import { getToken } from "../keyring/index.js";
import type {
	FeatureResolver,
	FeatureResolverConfig,
	ResolveTokenConfig,
	TokenResolver,
} from "./auth-resolver.type.js";

export { AuthError, type ResolveTokenInput };

/**
 * Kyber's `createResolveToken` with the keyring, the `HOLOCRON_ORG` variable and the `token` description
 * `holocron doctor tokens` reads filled in, so a plugin stays at a one-liner call site. The chain is the flag, the
 * plugin's variable, the vendor's variable, the `credentials` providers' variables, the keyring.
 */
export function createResolveToken(config: ResolveTokenConfig): TokenResolver {
	return Object.assign(createKyberResolveToken({ ...config, keyring: getToken, orgEnvName: "HOLOCRON_ORG" }), {
		token: { envName: config.envName, vendorEnvName: config.vendorEnvName, keyringKey: config.keyringService },
	});
}

/**
 * Kyber's `createFeatureResolver` for a strict, single-feature token: the flag, the feature's variable, the
 * `credentials` providers' variable of that name, the keyring. No broad-token fallback; if the feature's token is absent
 * the operation fails with a message naming the exact variable to set and `holocron auth set`.
 */
export function createFeatureResolver(config: FeatureResolverConfig): FeatureResolver {
	return Object.assign(
		createKyberFeatureResolver({
			...config,
			vendor: config.vendor ?? "GitHub",
			setCommand: (key) => `holocron auth set ${key} <token>`,
			keyring: getToken,
		}),
		{ token: { envName: config.envName, keyringKey: config.keyringKey } }
	);
}
