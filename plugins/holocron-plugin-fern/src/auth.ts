import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

import { EXPECTED } from "./probes/token/expectations.js";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Fern token from `--token`, `HOLOCRON_FERN_TOKEN`, `FERN_TOKEN` or the keyring entry for `fern`, and throws `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_FERN_TOKEN",
	vendorEnvName: "FERN_TOKEN",
	keyringService: "fern",
	errorMessage:
		"no Fern token found. Set HOLOCRON_FERN_TOKEN / FERN_TOKEN, " + "or run: holocron new token fern <token>",
});

/** Every token this plugin takes, for `holocron doctor tokens`, with the layers that hold it. */
export const tokens: PluginToken[] = [{ ...resolveToken.token, expect: EXPECTED }];
