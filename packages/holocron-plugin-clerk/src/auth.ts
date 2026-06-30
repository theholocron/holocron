/**
 * Token resolution for the Clerk plugin.
 *
 * Resolution order:
 *   1. explicit `cliToken` argument (from `--token` flag)
 *   2. HOLOCRON_CLERK_SECRET_KEY env var (preferred — explicit intent)
 *   3. CLERK_SECRET_KEY env var (the default Clerk's docs reference)
 *
 * The key (sk_test_* / sk_live_*) determines which Clerk instance —
 * Development or Production — every call hits.
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
    input.cliToken || env.HOLOCRON_CLERK_SECRET_KEY || env.CLERK_SECRET_KEY
  if (!token) {
    throw new AuthError(
      'no Clerk secret key found. Pass --token <KEY>, or set HOLOCRON_CLERK_SECRET_KEY / CLERK_SECRET_KEY.',
    )
  }
  return token
}
