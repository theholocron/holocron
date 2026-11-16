import {
	AuthError,
	createFeatureResolver,
	createResolveToken,
	type PluginToken,
	type ResolveTokenInput,
} from "@theholocron/cli";

import { API_EXPECTED, EXPECTED } from "./probes/token/expectations.js";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Codecov token from `--token`, `HOLOCRON_CODECOV_TOKEN`, `CODECOV_TOKEN` or the keyring entry for `codecov`, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_CODECOV_TOKEN",
	vendorEnvName: "CODECOV_TOKEN",
	keyringService: "codecov",
	errorMessage:
		"no Codecov token found. Pass --token <TOKEN>, set HOLOCRON_CODECOV_TOKEN / CODECOV_TOKEN, " +
		"or run: holocron new token codecov <TOKEN>",
});

/**
 * Resolves the Codecov API token (a personal access token, which Codecov's REST API takes as a bearer token) from
 * `--token`, `HOLOCRON_CODECOV_API_TOKEN` or the keyring entry `codecov.api`, and throws an `AuthError` naming the
 * variable when none is set. It never falls back to the upload token, which the REST API answers with a 401.
 */
export const resolveApiToken = createFeatureResolver({
	envName: "HOLOCRON_CODECOV_API_TOKEN",
	keyringKey: "codecov.api",
	vendor: "Codecov API",
});

/**
 * Every token this plugin takes, for `holocron doctor tokens`, with the layers that hold it: the repository upload token
 * and the optional API token the repository check reads.
 */
export const tokens: PluginToken[] = [
	{ ...resolveToken.token, expect: EXPECTED },
	{ ...resolveApiToken.token, optional: true, expect: API_EXPECTED },
];
