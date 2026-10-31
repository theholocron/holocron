import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_CHECKLY_TOKEN",
	vendorEnvName: "CHECKLY_API_KEY",
	keyringService: "checkly",
	errorMessage:
		"no Checkly token found. Pass --token <TOKEN>, set HOLOCRON_CHECKLY_TOKEN / CHECKLY_API_KEY, " +
		"or run: holocron auth set checkly <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
