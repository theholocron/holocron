import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_POSTHOG_TOKEN",
	vendorEnvName: "POSTHOG_PERSONAL_API_KEY",
	keyringService: "posthog",
	errorMessage:
		"no PostHog personal API key found. Pass --token <KEY>, set HOLOCRON_POSTHOG_TOKEN / POSTHOG_PERSONAL_API_KEY, " +
		"or run: holocron auth set posthog <phx_KEY>",
});
