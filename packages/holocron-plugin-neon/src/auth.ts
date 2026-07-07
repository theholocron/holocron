/**
 * Token resolution for the Neon plugin.
 *
 * Resolution order (matches the standard 4-step precedence set by
 * `.notes/tech-auth-bootstrap.spec.md`):
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_NEON_API_KEY env var (preferred — explicit intent)
 *   3. NEON_API_KEY env var (the default Neon CLI reads)
 *   4. keyring (com.theholocron.cli / "neon")
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
	const token = input.cliToken || env["HOLOCRON_NEON_API_KEY"] || env["NEON_API_KEY"] || keyring("neon");
	if (!token) {
		throw new AuthError(
			"no Neon API key found. Pass --token <KEY>, set HOLOCRON_NEON_API_KEY / NEON_API_KEY, " +
				"or run: holocron auth set neon <KEY>"
		);
	}
	return token;
}
