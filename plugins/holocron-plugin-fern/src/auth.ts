import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Fern token from `--token`, `HOLOCRON_FERN_TOKEN`, `FERN_TOKEN` or the keyring entry for `fern`, and throws `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_FERN_TOKEN",
	vendorEnvName: "FERN_TOKEN",
	keyringService: "fern",
	errorMessage:
		"no Fern token found. Set HOLOCRON_FERN_TOKEN / FERN_TOKEN, " + "or run: holocron auth set fern <token>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
