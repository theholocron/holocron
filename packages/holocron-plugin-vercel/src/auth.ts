/**
 * Token resolution for the Vercel plugin.
 *
 * Resolution order:
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_VERCEL_TOKEN env var (preferred — explicit intent)
 *   3. VERCEL_TOKEN env var (the default the Vercel CLI also reads)
 *
 * No `vercel auth` fallback — Vercel CLI auth is per-account-scoped
 * and the resulting tokens don't always cover team operations.
 */

export class AuthError extends Error {
  override name = 'AuthError'
}

export interface ResolveTokenInput {
  /** From `--token` CLI flag. */
  cliToken?: string
  /** Env vars; passed in for testability. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
}

export function resolveToken(input: ResolveTokenInput = {}): string {
  const env = input.env ?? process.env
  const token = input.cliToken || env.HOLOCRON_VERCEL_TOKEN || env.VERCEL_TOKEN
  if (!token) {
    throw new AuthError(
      'no Vercel token found. Pass --token <PAT>, or set HOLOCRON_VERCEL_TOKEN / VERCEL_TOKEN.',
    )
  }
  return token
}
