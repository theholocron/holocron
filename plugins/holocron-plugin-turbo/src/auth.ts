import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

import { EXPECTED } from "./probes/token/expectations.js";

export { AuthError };
export type { ResolveTokenInput };

/**
 * Resolves the Turbo remote-cache token from `--token`, `HOLOCRON_TURBO_TOKEN`, `TURBO_TOKEN` or the keyring, and
 * throws an `AuthError` when none is set. It is a Vercel token: Vercel serves the remote cache.
 */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_TURBO_TOKEN",
	vendorEnvName: "TURBO_TOKEN",
	keyringService: "turbo",
	errorMessage:
		"no Turbo token found. Pass --token <VERCEL_TOKEN>, set HOLOCRON_TURBO_TOKEN / TURBO_TOKEN, " +
		"or run: holocron new token turbo <VERCEL_TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`, with the layers that hold it. */
export const tokens: PluginToken[] = [{ ...resolveToken.token, expect: EXPECTED }];
