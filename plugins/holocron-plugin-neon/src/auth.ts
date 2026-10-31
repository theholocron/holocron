import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Neon API key from `--token`, `HOLOCRON_NEON_API_KEY`, `NEON_API_KEY` or the keyring entry for `neon`, and throws `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_NEON_API_KEY",
	vendorEnvName: "NEON_API_KEY",
	keyringService: "neon",
	errorMessage:
		"no Neon API key found. Pass --token <KEY>, set HOLOCRON_NEON_API_KEY / NEON_API_KEY, " +
		"or run: holocron auth set neon <KEY>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
