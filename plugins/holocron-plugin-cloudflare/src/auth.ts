import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Cloudflare API token from `--token`, `HOLOCRON_CLOUDFLARE_TOKEN`, `CLOUDFLARE_API_TOKEN` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_CLOUDFLARE_TOKEN",
	vendorEnvName: "CLOUDFLARE_API_TOKEN",
	keyringService: "cloudflare",
	errorMessage:
		"no Cloudflare API token found. Pass --token <TOKEN>, set HOLOCRON_CLOUDFLARE_TOKEN / CLOUDFLARE_API_TOKEN, " +
		"or run: holocron auth set cloudflare <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
