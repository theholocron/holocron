/**
 * Token resolution for the Vercel plugin.
 *
 * Resolution order (matches the standard 4-step precedence set by
 * `.notes/tech-auth-bootstrap.spec.md`):
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_VERCEL_TOKEN env var (preferred — explicit intent)
 *   3. VERCEL_TOKEN env var (the default the Vercel CLI also reads)
 *   4. keyring (com.theholocron.cli / "vercel")
 *   5. AuthError naming all four options + the bootstrap hint
 *
 * No `vercel auth` fallback — Vercel CLI auth is per-account-scoped
 * and the resulting tokens don't always cover team operations.
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
	const token = input.cliToken || env["HOLOCRON_VERCEL_TOKEN"] || env["VERCEL_TOKEN"] || keyring("vercel");
	if (!token) {
		throw new AuthError(
			"no Vercel token found. Pass --token <PAT>, set HOLOCRON_VERCEL_TOKEN / VERCEL_TOKEN, " +
				"or run: holocron auth set vercel <PAT>"
		);
	}
	return token;
}
