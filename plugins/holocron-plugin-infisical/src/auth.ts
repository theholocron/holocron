import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Infisical token from `--token`, `HOLOCRON_INFISICAL_TOKEN`, `INFISICAL_TOKEN` or the keyring entry for `infisical`, and throws `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_INFISICAL_TOKEN",
	vendorEnvName: "INFISICAL_TOKEN",
	keyringService: "infisical",
	errorMessage:
		"no Infisical token found. Pass --token <TOKEN>, set HOLOCRON_INFISICAL_TOKEN / INFISICAL_TOKEN, " +
		"or run: holocron auth set infisical <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
