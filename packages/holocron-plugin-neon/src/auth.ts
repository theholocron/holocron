import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_NEON_API_KEY",
	vendorEnvName: "NEON_API_KEY",
	keyringService: "neon",
	errorMessage:
		"no Neon API key found. Pass --token <KEY>, set HOLOCRON_NEON_API_KEY / NEON_API_KEY, " +
		"or run: holocron auth set neon <KEY>",
});
