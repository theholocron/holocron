import {
	AuthError,
	createResolveToken,
	type PluginToken,
	type ResolveTokenInput,
	resolveValue,
} from "@theholocron/cli";
import { PREFIX } from "@theholocron/env-utils/lookup";

import { EXPECTED } from "./probes/token/expectations.js";
import { verifyToken } from "./verify-token.js";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Axiom token from `--token`, `HOLOCRON_AXIOM_TOKEN`, `AXIOM_TOKEN` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_AXIOM_TOKEN",
	vendorEnvName: "AXIOM_TOKEN",
	keyringService: "axiom",
	errorMessage:
		"no Axiom token found. Pass --token <TOKEN>, set HOLOCRON_AXIOM_TOKEN / AXIOM_TOKEN, " +
		"or run: holocron new token axiom <TOKEN>",
});

/** Every token this plugin takes, for `holocron doctor secrets --verify`, with what each layer's token must and must not be able to do. */
export const tokens: PluginToken[] = [
	{
		...resolveToken.token,
		// An API token is scoped per dataset, so it is checked against the one it is meant for: `HOLOCRON_AXIOM_DATASET` from
		// the process environment or a `credentials` provider, as the Cloudflare plugin reads its account id.
		verify: (token) =>
			verifyToken(token, { dataset: resolveValue(["AXIOM_DATASET"], undefined, { prefix: PREFIX }) }),
		expect: EXPECTED,
	},
];
