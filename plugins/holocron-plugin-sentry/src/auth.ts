import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_SENTRY_TOKEN",
	vendorEnvName: "SENTRY_AUTH_TOKEN",
	keyringService: "sentry",
	errorMessage:
		"no Sentry auth token found. Pass --token <TOKEN>, set HOLOCRON_SENTRY_TOKEN / SENTRY_AUTH_TOKEN, " +
		"or run: holocron auth set sentry <TOKEN>",
});
