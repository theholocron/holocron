import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_FERN_TOKEN",
	vendorEnvName: "FERN_TOKEN",
	keyringService: "fern",
	errorMessage:
		"no Fern token found. Set HOLOCRON_FERN_TOKEN / FERN_TOKEN, " + "or run: holocron auth set fern <token>",
});
