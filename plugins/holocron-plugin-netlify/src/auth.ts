import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Netlify token from `--token`, `HOLOCRON_NETLIFY_TOKEN`, `NETLIFY_AUTH_TOKEN` or the keyring entry for `netlify`, and throws `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_NETLIFY_TOKEN",
	vendorEnvName: "NETLIFY_AUTH_TOKEN",
	keyringService: "netlify",
	errorMessage:
		"no Netlify token found. Pass --token <TOKEN>, set HOLOCRON_NETLIFY_TOKEN / NETLIFY_AUTH_TOKEN, " +
		"or run: holocron auth set netlify <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
