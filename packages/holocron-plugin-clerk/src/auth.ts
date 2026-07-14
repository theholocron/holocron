import { AuthError, createResolveToken, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError };
export type { ResolveTokenInput };

export const resolveToken = createResolveToken({
	envName: "HOLOCRON_CLERK_SECRET_KEY",
	vendorEnvName: "CLERK_SECRET_KEY",
	keyringService: "clerk",
	errorMessage:
		"no Clerk secret key found. Pass --token <KEY>, set HOLOCRON_CLERK_SECRET_KEY / CLERK_SECRET_KEY, " +
		"or run: holocron auth set clerk <KEY>",
});
