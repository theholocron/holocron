/**
 * Token resolution for the GitHub plugin. See README §Auth.
 *
 * Resolution order (matches the standard 4-step precedence set by
 * `.notes/tech-auth-bootstrap.spec.md`):
 *   1. explicit `token` argument (from `--token` flag)
 *   2. HOLOCRON_GH_TOKEN env var (preferred over GITHUB_TOKEN — clearer intent)
 *   3. GITHUB_TOKEN env var (auto-injected in GH Actions)
 *   4. keyring (com.theholocron.cli / "github")
 *   5. AuthError naming all four options + the bootstrap hint
 *
 * No `gh auth token` fallback by design — it usually has narrower
 * scopes than admin commands need.
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
	const token = input.cliToken || env.HOLOCRON_GH_TOKEN || env.GITHUB_TOKEN || keyring("github");
	if (!token) {
		throw new AuthError(
			"no GitHub token found. Pass --token <PAT>, set HOLOCRON_GH_TOKEN / GITHUB_TOKEN, " +
				"or run: holocron auth set github <PAT>"
		);
	}
	return token;
}
