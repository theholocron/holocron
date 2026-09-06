import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_AXIOM_TOKEN",
	vendorEnvName: "AXIOM_TOKEN",
	keyringService: "axiom",
	errorMessage:
		"no Axiom token found. Pass --token <TOKEN>, set HOLOCRON_AXIOM_TOKEN / AXIOM_TOKEN, " +
		"or run: holocron auth set axiom <TOKEN>",
});
