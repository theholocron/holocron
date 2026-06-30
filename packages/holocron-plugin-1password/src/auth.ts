/**
 * 1Password plugin "auth" is just verifying the `op` binary is on
 * PATH — the CLI handles its own auth (keychain biometric unlock for
 * local dev, OP_SERVICE_ACCOUNT_TOKEN for CI).
 *
 * No `resolveToken()` like the REST plugins; instead, `verifyOpInstalled`
 * runs a fast `op --version` check. `createPlugin` calls it eagerly so
 * a missing binary fails fast and clearly, not as a mystery error when
 * the first `vault.read()` happens later.
 */

import { spawnSync } from 'node:child_process'

export class AuthError extends Error {
  override name = 'AuthError'
}

export interface VerifyInput {
  /** Override the spawn function in tests. */
  spawn?: typeof spawnSync
  /** Path to the op binary. Defaults to "op". */
  binary?: string
}

export function verifyOpInstalled(input: VerifyInput = {}): void {
  const spawnImpl = input.spawn ?? spawnSync
  const binary = input.binary ?? 'op'
  const result = spawnImpl(binary, ['--version'], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) {
    throw new AuthError(
      `1Password CLI (\`${binary}\`) not found on PATH. Install via \`brew install 1password-cli\` or see https://developer.1password.com/docs/cli/get-started.`,
    )
  }
  if (result.status !== 0) {
    const detail = (result.stderr ?? '').trim() || `exit ${result.status ?? '?'}`
    throw new AuthError(`\`${binary} --version\` failed: ${detail}`)
  }
}
