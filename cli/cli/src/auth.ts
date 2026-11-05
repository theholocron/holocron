/**
 * The CLI's credentials: the OS keyring every plugin's bootstrap token lives in, and the two token resolvers built on
 * it. Both are public, so a plugin's `src/auth.ts` is a one-line call.
 *
 * The keyring itself, with its best-effort failure model and its per-process cache, is `createKeyring` in
 * `@theholocron/kyber/secrets`; this file only names the service. Managed via `holocron auth` subcommands and consulted
 * last in every plugin's precedence chain (after --token / HOLOCRON_<X>_TOKEN / <native>_TOKEN). See
 * `docs/wiki/specifications/tech-auth-bootstrap.spec.md`.
 */

import { Entry, findCredentials } from "@napi-rs/keyring";
import {
	AuthError,
	createFeatureResolver as createKyberFeatureResolver,
	createKeyring,
	createResolveToken as createKyberResolveToken,
	type ResolveTokenInput,
} from "@theholocron/kyber/secrets";

import type { FeatureResolver, FeatureResolverConfig, ResolveTokenConfig, TokenResolver } from "./auth.type.js";

export { AuthError, type ResolveTokenInput };

/**
 * The holocron keyring: `get` answers `null` for "not stored" and for "keyring unavailable" alike, so callers fall
 * through to env-var precedence, and remembers the answer for the process (`clearCache` forgets it); `set` and `delete`
 * answer whether they did anything; `list` names the stored providers; `isAvailable` tells an outage from an empty keyring.
 */
// The binding is passed in, not left to kyber to load, because this package depends on `@napi-rs/keyring` itself.
export const keyring = createKeyring({ service: "com.theholocron.cli", binding: { Entry, findCredentials } });

/**
 * Kyber's `createResolveToken` with the keyring, the `HOLOCRON_ORG` variable and the `token` description
 * `holocron doctor tokens` reads filled in, so a plugin stays at a one-liner call site. The chain is the flag, the
 * plugin's variable, the vendor's variable, the `credentials` providers' variables, the keyring.
 */
export function createResolveToken(config: ResolveTokenConfig): TokenResolver {
	return Object.assign(createKyberResolveToken({ ...config, keyring: keyring.get, orgEnvName: "HOLOCRON_ORG" }), {
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
			keyring: keyring.get,
		}),
		{ token: { envName: config.envName, keyringKey: config.keyringKey } }
	);
}
