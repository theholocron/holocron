/**
 * Token resolution for the Postman plugin.
 *
 * Resolution order:
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_POSTMAN_API_KEY env var (preferred — explicit intent)
 *   3. POSTMAN_API_KEY env var (Postman's own default)
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
  const token =
    input.cliToken || env.HOLOCRON_POSTMAN_API_KEY || env.POSTMAN_API_KEY
  if (!token) {
    throw new AuthError(
      'no Postman API key found. Pass --token <KEY>, or set HOLOCRON_POSTMAN_API_KEY / POSTMAN_API_KEY.',
    )
  }
  return token
}
