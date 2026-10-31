import {
	AuthError,
	createFeatureResolver,
	createResolveToken,
	type PluginToken,
	type ResolveTokenInput,
} from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the Sentry token from `--token`, `HOLOCRON_SENTRY_TOKEN`, `SENTRY_AUTH_TOKEN` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_SENTRY_TOKEN",
	vendorEnvName: "SENTRY_AUTH_TOKEN",
	keyringService: "sentry",
	errorMessage:
		"no Sentry auth token found. Pass --token <TOKEN>, set HOLOCRON_SENTRY_TOKEN / SENTRY_AUTH_TOKEN, " +
		"or run: holocron auth set sentry <TOKEN>",
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

/** Every token this plugin takes, for `holocron doctor tokens`: the general one and the Comlink relay's own. */
export const tokens: PluginToken[] = [resolveToken.token, resolveComlinkToken.token];
