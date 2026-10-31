import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_POSTMAN_API_KEY",
	vendorEnvName: "POSTMAN_API_KEY",
	keyringService: "postman",
	errorMessage:
		"no Postman API key found. Pass --token <KEY>, set HOLOCRON_POSTMAN_API_KEY / POSTMAN_API_KEY, " +
		"or run: holocron auth set postman <KEY>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
