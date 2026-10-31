import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

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
