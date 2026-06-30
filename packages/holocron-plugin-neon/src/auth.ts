/**
 * Token resolution for the Neon plugin.
 *
 * Resolution order:
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_NEON_API_KEY env var (preferred — explicit intent)
 *   3. NEON_API_KEY env var (the default Neon CLI reads)
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
  const token = input.cliToken || env.HOLOCRON_NEON_API_KEY || env.NEON_API_KEY
  if (!token) {
    throw new AuthError(
      'no Neon API key found. Pass --token <KEY>, or set HOLOCRON_NEON_API_KEY / NEON_API_KEY.',
    )
  }
  return token
}
