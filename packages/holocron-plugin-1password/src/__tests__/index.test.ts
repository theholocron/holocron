import { describe, expect, it } from 'vitest'

import { AuthError, OpVault, createPlugin } from '../index.js'

import { stubSpawn } from './helpers.js'

describe('createPlugin', () => {
  it('throws when `vault` option is missing', () => {
    const { spawn } = stubSpawn([{ status: 0, stdout: '2.30.0' }])
    // @ts-expect-error — deliberately missing required field
    expect(() => createPlugin({ spawn })).toThrow(/vault/)
  })

  it('throws AuthError when `op` is missing from PATH', () => {
    const { spawn } = stubSpawn([{ error: new Error('spawn ENOENT') }])
    expect(() => createPlugin({ vault: 'rando', spawn })).toThrow(AuthError)
  })

  it('wires the vault capability', () => {
    const { spawn } = stubSpawn([{ status: 0, stdout: '2.30.0' }])
    const plugin = createPlugin({ vault: 'rando', spawn })
    expect(plugin.name).toBe('@theholocron/holocron-plugin-1password')
    expect(plugin.capabilities.vault()).toBeInstanceOf(OpVault)
  })

  it('passes account UUID through to the shell', async () => {
    const { spawn, calls } = stubSpawn([
      { status: 0, stdout: '2.30.0' }, // verifyOpInstalled
      { status: 0, stdout: 'value' }, // first vault.read
    ])
    const plugin = createPlugin({
      vault: 'rando',
      account: 'ABCDEF',
      spawn,
    })
    await plugin.capabilities.vault().read('op://rando/X/v')
    // calls[0] is --version (no --account); calls[1] is the read.
    expect(calls[1]?.args).toEqual([
      '--account',
      'ABCDEF',
      'read',
      'op://rando/X/v',
      '--no-newline',
    ])
  })
})
