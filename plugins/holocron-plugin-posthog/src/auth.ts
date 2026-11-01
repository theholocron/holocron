import { AuthError, createResolveToken, type PluginToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

/** Resolves the PostHog personal API key from `--token`, `HOLOCRON_POSTHOG_TOKEN`, `POSTHOG_PERSONAL_API_KEY` or the keyring, and throws an `AuthError` when none is set. */
export const resolveToken = createResolveToken({
	envName: "HOLOCRON_POSTHOG_TOKEN",
	vendorEnvName: "POSTHOG_PERSONAL_API_KEY",
	keyringService: "posthog",
	errorMessage:
		"no PostHog personal API key found. Pass --token <KEY>, set HOLOCRON_POSTHOG_TOKEN / POSTHOG_PERSONAL_API_KEY, " +
		"or run: holocron auth set posthog <phx_KEY>",
});

/** Every token this plugin takes, for `holocron doctor tokens`. */
export const tokens: PluginToken[] = [resolveToken.token];
