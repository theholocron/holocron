import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Clerk secret key from `--token`, `HOLOCRON_CLERK_SECRET_KEY`, `CLERK_SECRET_KEY` or the keyring entry for `clerk`, and throws `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_CLERK_SECRET_KEY",
	vendorEnvName: "CLERK_SECRET_KEY",
	keyringService: "clerk",
	errorMessage:
		"no Clerk secret key found. Pass --token <KEY>, set HOLOCRON_CLERK_SECRET_KEY / CLERK_SECRET_KEY, " +
		"or run: holocron auth set clerk <KEY>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
