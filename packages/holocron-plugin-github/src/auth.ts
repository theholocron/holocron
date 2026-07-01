/**
 * Token resolution for the GitHub plugin. See README §Auth.
 *
 * Resolution order:
 *   1. explicit `token` argument (from `--token` flag)
 *   2. HOLOCRON_GH_TOKEN env var (preferred over GITHUB_TOKEN — clearer intent)
 *   3. GITHUB_TOKEN env var (auto-injected in GH Actions)
 *
 * No `gh auth token` fallback by design — it usually has narrower
 * scopes than admin commands need.
 */

export class AuthError extends Error {
	override name = "AuthError";
}

export interface ResolveTokenInput {
	/** From `--token` CLI flag. */
	cliToken?: string;
	/** Env vars; passed in for testability. Defaults to `process.env`. */
	env?: NodeJS.ProcessEnv;
}

export function resolveToken(input: ResolveTokenInput = {}): string {
	const env = input.env ?? process.env;
	const token = input.cliToken || env.HOLOCRON_GH_TOKEN || env.GITHUB_TOKEN;
	if (!token) {
		throw new AuthError("no GitHub token found. Pass --token <PAT>, or set HOLOCRON_GH_TOKEN / GITHUB_TOKEN.");
	}
	return token;
}
