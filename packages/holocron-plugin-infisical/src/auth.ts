/**
 * Token resolution for the Infisical plugin.
 *
 * Resolution order (matches the standard 4-step precedence set by
 * `.notes/tech-auth-bootstrap.spec.md`):
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_INFISICAL_TOKEN env var (preferred — explicit intent)
 *   3. INFISICAL_TOKEN env var (vendor-native)
 *   4. keyring (com.theholocron.cli / "infisical")
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
	// Bracket access so numeric-prefixed slugs (e.g., env.HOLOCRON_1PASSWORD_TOKEN
	// which is invalid JS) still produce syntactically valid code.
	const token = input.cliToken || env["HOLOCRON_INFISICAL_TOKEN"] || env["INFISICAL_TOKEN"] || keyring("infisical");
	if (!token) {
		throw new AuthError(
			"no Infisical token found. Pass --token <TOKEN>, set HOLOCRON_INFISICAL_TOKEN / INFISICAL_TOKEN, " +
				"or run: holocron auth set infisical <TOKEN>"
		);
	}
	return token;
}
