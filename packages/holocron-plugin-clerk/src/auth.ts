/**
 * Token resolution for the Clerk plugin.
 *
 * Resolution order (matches the standard 4-step precedence set by
 * `.notes/tech-auth-bootstrap.spec.md`):
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_CLERK_SECRET_KEY env var (preferred — explicit intent)
 *   3. CLERK_SECRET_KEY env var (the default Clerk's docs reference)
 *   4. keyring (com.theholocron.cli / "clerk")
 *   5. AuthError naming all four options + the bootstrap hint
 *
 * The key (sk_test_* / sk_live_*) determines which Clerk instance —
 * Development or Production — every call hits.
 */

import { getToken as getKeyringToken } from "@theholocron/cli";

export class AuthError extends Error {
	override name = "AuthError";
}

export interface ResolveTokenInput {
	/** From `--token` CLI flag. */
	cliToken?: string;
	/** Env vars; passed in for testability. Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv;
	/** Keyring lookup fn; passed in for testability. Defaults to `getToken(provider)`. */
	keyring?: (provider: string) => string | null;
}

export function resolveToken(input: ResolveTokenInput = {}): string {
	const env = input.env ?? process.env;
	const keyring = input.keyring ?? getKeyringToken;
	const token = input.cliToken || env["HOLOCRON_CLERK_SECRET_KEY"] || env["CLERK_SECRET_KEY"] || keyring("clerk");
	if (!token) {
		throw new AuthError(
			"no Clerk secret key found. Pass --token <KEY>, set HOLOCRON_CLERK_SECRET_KEY / CLERK_SECRET_KEY, " +
				"or run: holocron auth set clerk <KEY>"
		);
	}
	return token;
}
