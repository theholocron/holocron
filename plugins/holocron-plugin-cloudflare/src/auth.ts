import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

import { EXPECTED } from "./probes/token/expectations.js";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Cloudflare API token from `--token`, `HOLOCRON_CLOUDFLARE_TOKEN`, `CLOUDFLARE_API_TOKEN` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_CLOUDFLARE_TOKEN",
	vendorEnvName: "CLOUDFLARE_API_TOKEN",
	keyringService: "cloudflare",
	errorMessage:
		"no Cloudflare API token found. Pass --token <TOKEN>, set HOLOCRON_CLOUDFLARE_TOKEN / CLOUDFLARE_API_TOKEN, " +
		"or run: holocron new token cloudflare <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor tokens`, with what each layer's token must and must not be able to do. */
export const tokens: PluginToken[] = [{ ...resolveToken.token, expect: EXPECTED }];
