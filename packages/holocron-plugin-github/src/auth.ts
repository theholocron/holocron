import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_GH_TOKEN",
	vendorEnvName: "GITHUB_TOKEN",
	keyringService: "github",
	errorMessage:
		"no GitHub token found. Pass --token <PAT>, set HOLOCRON_GH_TOKEN / GITHUB_TOKEN, " +
		"or run: holocron auth set github <PAT>",
});
