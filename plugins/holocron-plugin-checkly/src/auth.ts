import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Checkly API key from `--token`, `HOLOCRON_CHECKLY_TOKEN`, `CHECKLY_API_KEY` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_CHECKLY_TOKEN",
	vendorEnvName: "CHECKLY_API_KEY",
	keyringService: "checkly",
	errorMessage:
		"no Checkly token found. Pass --token <TOKEN>, set HOLOCRON_CHECKLY_TOKEN / CHECKLY_API_KEY, " +
		"or run: holocron auth set checkly <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
