import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Doppler token from `--token`, `HOLOCRON_DOPPLER_TOKEN`, `DOPPLER_TOKEN` or the keyring entry for `doppler`, and throws `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_DOPPLER_TOKEN",
	vendorEnvName: "DOPPLER_TOKEN",
	keyringService: "doppler",
	errorMessage:
		"no Doppler token found. Pass --token <TOKEN>, set HOLOCRON_DOPPLER_TOKEN / DOPPLER_TOKEN, " +
		"or run: holocron new token doppler $(doppler configure get token --plain)",
});

/** Every token this plugin takes, for `holocron doctor secrets --verify`. */
export const tokens: PluginToken[] = [resolveToken.token];
