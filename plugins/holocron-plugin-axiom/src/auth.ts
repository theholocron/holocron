import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

import { EXPECTED } from "./probes/token/expectations.js";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Axiom token from `--token`, `HOLOCRON_AXIOM_TOKEN`, `AXIOM_TOKEN` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_AXIOM_TOKEN",
	vendorEnvName: "AXIOM_TOKEN",
	keyringService: "axiom",
	errorMessage:
		"no Axiom token found. Pass --token <TOKEN>, set HOLOCRON_AXIOM_TOKEN / AXIOM_TOKEN, " +
		"or run: holocron new token axiom <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor secrets --verify`, with what each layer's token must and must not be able to do. */
export const tokens: PluginToken[] = [{ ...resolveToken.token, expect: EXPECTED }];
