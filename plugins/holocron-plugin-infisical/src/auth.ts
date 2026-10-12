import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_INFISICAL_TOKEN",
	vendorEnvName: "INFISICAL_TOKEN",
	keyringService: "infisical",
	errorMessage:
		"no Infisical token found. Pass --token <TOKEN>, set HOLOCRON_INFISICAL_TOKEN / INFISICAL_TOKEN, " +
		"or run: holocron auth set infisical <TOKEN>",
});
