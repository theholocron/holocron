/**
 * Token resolution for the Postman plugin.
 *
 * Resolution order (matches the standard 4-step precedence set by
 * `.notes/tech-auth-bootstrap.spec.md`):
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_POSTMAN_API_KEY env var (preferred — explicit intent)
 *   3. POSTMAN_API_KEY env var (Postman's own default)
 *   4. keyring (com.theholocron.cli / "postman")
 *   5. AuthError naming all four options + the bootstrap hint
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
	const token = input.cliToken || env["HOLOCRON_POSTMAN_API_KEY"] || env["POSTMAN_API_KEY"] || keyring("postman");
	if (!token) {
		throw new AuthError(
			"no Postman API key found. Pass --token <KEY>, set HOLOCRON_POSTMAN_API_KEY / POSTMAN_API_KEY, " +
				"or run: holocron auth set postman <KEY>"
		);
	}
	return token;
}
