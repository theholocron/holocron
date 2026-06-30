import { describe, expect, it } from 'vitest'

import { AuthError, resolveToken } from '../auth.js'

describe('resolveToken', () => {
  it('uses the explicit CLI token first', () => {
    expect(
      resolveToken({
        cliToken: 'cli-pat',
        env: { HOLOCRON_GH_TOKEN: 'env-pat', GITHUB_TOKEN: 'gha-pat' },
      }),
    ).toBe('cli-pat')
  })

  it('prefers HOLOCRON_GH_TOKEN over GITHUB_TOKEN', () => {
    expect(
      resolveToken({
        env: { HOLOCRON_GH_TOKEN: 'env-pat', GITHUB_TOKEN: 'gha-pat' },
      }),
    ).toBe('env-pat')
  })

  it('falls back to GITHUB_TOKEN when only it is set', () => {
    expect(resolveToken({ env: { GITHUB_TOKEN: 'gha-pat' } })).toBe('gha-pat')
  })

  it('throws AuthError with a helpful message when nothing is set', () => {
    expect(() => resolveToken({ env: {} })).toThrow(AuthError)
    expect(() => resolveToken({ env: {} })).toThrow(/HOLOCRON_GH_TOKEN/)
    expect(() => resolveToken({ env: {} })).toThrow(/--token/)
  })

  it('ignores empty-string cliToken (treats as absent)', () => {
    expect(resolveToken({ cliToken: '', env: { GITHUB_TOKEN: 'gha-pat' } })).toBe('gha-pat')
  })
})
