import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Vercel token from `--token`, `HOLOCRON_VERCEL_TOKEN`, `VERCEL_TOKEN` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_VERCEL_TOKEN",
	vendorEnvName: "VERCEL_TOKEN",
	keyringService: "vercel",
	errorMessage:
		"no Vercel token found. Pass --token <PAT>, set HOLOCRON_VERCEL_TOKEN / VERCEL_TOKEN, " +
		"or run: holocron auth set vercel <PAT>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
