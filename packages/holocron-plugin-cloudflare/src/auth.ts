import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

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
