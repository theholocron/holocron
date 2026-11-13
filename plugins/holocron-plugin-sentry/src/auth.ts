import {
	AuthError,
	createFeatureResolver,
	createResolveToken,
	type PluginToken,
	type ResolveTokenInput,
} from "@theholocron/cli";

import { COMLINK, GENERAL, RELEASE } from "./probes/token/expectations.js";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Sentry token from `--token`, `HOLOCRON_SENTRY_TOKEN`, `SENTRY_AUTH_TOKEN` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_SENTRY_TOKEN",
	vendorEnvName: "SENTRY_AUTH_TOKEN",
	keyringService: "sentry",
	errorMessage:
		"no Sentry auth token found. Pass --token <TOKEN>, set HOLOCRON_SENTRY_TOKEN / SENTRY_AUTH_TOKEN, " +
		"or run: holocron new token sentry <TOKEN>",
});

/**
 * The token for the Comlink relay: an integration, its client secret and an alert rule need more than the general token
 * (`alerts:write`, `org:write`, `event:read`), so it has its own.
 */
export const resolveComlinkToken = createFeatureResolver({
	envName: "HOLOCRON_SENTRY_COMLINK_TOKEN",
	keyringKey: "sentry.comlink",
	vendor: "Sentry",
});

/**
 * The token for the relay: the Comlink one when there is one, else the general Sentry token as the last resort. The
 * fallback only helps if the general token happens to carry the scopes; otherwise Sentry's answer names what is missing.
 */
export function resolveRelayToken(input: ResolveTokenInput = {}): string {
	try {
		return resolveComlinkToken(input);
	} catch (err) {
		if (!(err instanceof AuthError)) throw err;
		return resolveToken(input);
	}
}

/**
 * The token only `release.yml` reads (sentry-cli makes the release and uploads sourcemaps): an organization token with
 * `org:ci` held in the `ci` layer. The plugin never resolves it, so it is `optional` and `verifiable: false` (the
 * plugin's `verifyToken` lists organizations, which this token must not be able to do); it is declared so the probe and
 * `holocron probe sentry token --environment ci` can find it and check that it reaches nothing else.
 */
const releaseToken: PluginToken = {
	envName: "HOLOCRON_SENTRY_RELEASE_TOKEN",
	keyringKey: "sentry.release",
	optional: true,
	verifiable: false,
	expect: RELEASE,
};

/**
 * Every token this plugin takes, for `holocron doctor secrets --verify`, each with what its layer's token must and must not be
 * able to do: the general one, the Comlink relay's own and the CI release token.
 */
export const tokens: PluginToken[] = [
	{ ...resolveToken.token, expect: GENERAL },
	{ ...resolveComlinkToken.token, expect: COMLINK },
	releaseToken,
];
