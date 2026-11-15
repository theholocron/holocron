import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

import { EXPECTED } from "./probes/token/expectations.js";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Codecov token from `--token`, `HOLOCRON_CODECOV_TOKEN`, `CODECOV_TOKEN` or the keyring entry for `codecov`, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_CODECOV_TOKEN",
	vendorEnvName: "CODECOV_TOKEN",
	keyringService: "codecov",
	errorMessage:
		"no Codecov token found. Pass --token <TOKEN>, set HOLOCRON_CODECOV_TOKEN / CODECOV_TOKEN, " +
		"or run: holocron new token codecov <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`, with the layers that hold it. */
export const tokens: PluginToken[] = [{ ...resolveToken.token, expect: EXPECTED }];
