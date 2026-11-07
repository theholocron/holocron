import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Linear token from `--token`, `HOLOCRON_LINEAR_TOKEN`, `LINEAR_API_KEY` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_LINEAR_TOKEN",
	vendorEnvName: "LINEAR_API_KEY",
	keyringService: "linear",
	errorMessage:
		"no Linear API key found. Pass --token <KEY>, set HOLOCRON_LINEAR_TOKEN / LINEAR_API_KEY, " +
		"or run: holocron auth set linear <KEY>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
