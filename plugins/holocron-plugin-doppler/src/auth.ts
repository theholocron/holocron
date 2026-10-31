import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_DOPPLER_TOKEN",
	vendorEnvName: "DOPPLER_TOKEN",
	keyringService: "doppler",
	errorMessage:
		"no Doppler token found. Pass --token <TOKEN>, set HOLOCRON_DOPPLER_TOKEN / DOPPLER_TOKEN, " +
		"or run: holocron auth set doppler $(doppler configure get token --plain)",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
