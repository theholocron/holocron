import { ProviderApiError } from '@theholocron/cli'
import { describe, expect, it } from 'vitest'

import { OpVault } from '../capabilities/vault.js'
import { OpShell } from '../shell.js'

import { stubSpawn } from './helpers.js'

function makeVault(
  responses: Parameters<typeof stubSpawn>[0],
  opts: { account?: string } = {},
) {
  const { spawn, calls } = stubSpawn(responses)
  const shellOpts: ConstructorParameters<typeof OpShell>[0] = { spawn }
  if (opts.account !== undefined) shellOpts.account = opts.account
  const shell = new OpShell(shellOpts)
  const vault = new OpVault(shell, { vault: 'rando' })
  return { vault, calls }
}

// ──────────────────────────────────────────────────────────────────────
// read
// ──────────────────────────────────────────────────────────────────────

describe('OpVault.read', () => {
  it('shells out to `op read <ref> --no-newline`', async () => {
    const { vault, calls } = makeVault([{ status: 0, stdout: 'sk_test_secret' }])
    const result = await vault.read('op://rando/CLERK/secret_key')
    expect(calls[0]?.args).toEqual(['read', 'op://rando/CLERK/secret_key', '--no-newline'])
    expect(result).toBe('sk_test_secret')
  })

  it('throws ProviderApiError on non-zero', async () => {
    const { vault } = makeVault([{ status: 1, stderr: '[ERROR] not found' }])
    await expect(vault.read('op://rando/MISSING/x')).rejects.toBeInstanceOf(ProviderApiError)
  })
})

// ──────────────────────────────────────────────────────────────────────
// write — exists path (probe + edit)
// ──────────────────────────────────────────────────────────────────────

describe('OpVault.write — existing item path', () => {
  it('probes `op item get`, then `op item edit` when the item exists', async () => {
    const { vault, calls } = makeVault([
      // 1. probe (exists)
      { status: 0, stdout: JSON.stringify({ id: 'item_id', title: 'CLERK' }) },
      // 2. edit
      { status: 0, stdout: '' },
    ])
    await vault.write('op://rando/CLERK/secret_key', 'new-value')

    expect(calls[0]?.args).toEqual([
      'item',
      'get',
      'CLERK',
      '--vault=rando',
      '--format=json',
    ])
    expect(calls[1]?.args).toEqual([
      'item',
      'edit',
      'CLERK',
      '--vault=rando',
      'secret_key=new-value',
    ])
  })

  it('throws ProviderApiError when the edit fails', async () => {
    const { vault } = makeVault([
      { status: 0, stdout: '{}' }, // probe exists
      { status: 1, stderr: 'edit failed' }, // edit fails
    ])
    await expect(vault.write('op://rando/CLERK/secret_key', 'x')).rejects.toThrow(/edit failed/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// write — create-fallback path
// ──────────────────────────────────────────────────────────────────────

describe('OpVault.write — create-fallback path', () => {
  it('falls back to `op item create --category=API Credential` when the probe returns non-zero', async () => {
    const { vault, calls } = makeVault([
      { status: 1, stderr: '[ERROR] item not found' }, // probe missing
      { status: 0, stdout: '' }, // create
    ])
    await vault.write('op://rando/NEW_SECRET/value', 'fresh-value')

    expect(calls[1]?.args).toEqual([
      'item',
      'create',
      '--title=NEW_SECRET',
      '--vault=rando',
      '--category=API Credential',
      'value=fresh-value',
    ])
  })

  it('throws ProviderApiError when the create fails', async () => {
    const { vault } = makeVault([
      { status: 1, stderr: 'missing' }, // probe
      { status: 1, stderr: 'vault not found' }, // create
    ])
    await expect(vault.write('op://wrong/X/v', 'x')).rejects.toThrow(/vault not found/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// reference parsing
// ──────────────────────────────────────────────────────────────────────

describe('OpVault.write — reference parsing', () => {
  it('throws on a reference without the op:// prefix', async () => {
    const { vault } = makeVault([])
    await expect(vault.write('rando/X/v', 'x')).rejects.toThrow(/must start with "op:\/\/"/)
  })

  it('throws on a reference missing required parts', async () => {
    const { vault } = makeVault([])
    await expect(vault.write('op://only-vault', 'x')).rejects.toThrow(/missing parts/)
  })

  it('allows a slash inside the field portion (e.g., nested field paths)', async () => {
    const { vault, calls } = makeVault([
      { status: 0, stdout: '{}' }, // probe exists
      { status: 0, stdout: '' }, // edit
    ])
    await vault.write('op://rando/Item/section/nested', 'v')
    expect(calls[1]?.args).toContain('section/nested=v')
  })
})

// ──────────────────────────────────────────────────────────────────────
// list
// ──────────────────────────────────────────────────────────────────────

describe('OpVault.list', () => {
  it('runs `op item list --vault=<vault> --format=json` and returns titles', async () => {
    const { vault, calls } = makeVault([
      {
        status: 0,
        stdout: JSON.stringify([
          { id: '1', title: 'CLERK' },
          { id: '2', title: 'NEON' },
        ]),
      },
    ])
    const result = await vault.list()
    expect(calls[0]?.args).toEqual(['item', 'list', '--vault=rando', '--format=json'])
    expect(result).toEqual(['CLERK', 'NEON'])
  })

  it('returns [] when op outputs empty', async () => {
    const { vault } = makeVault([{ status: 0, stdout: '' }])
    expect(await vault.list()).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────────────────
// environments
// ──────────────────────────────────────────────────────────────────────

describe('OpVault.environments', () => {
  it('runs `op environment list --format=json` and returns names', async () => {
    const { vault, calls } = makeVault([
      {
        status: 0,
        stdout: JSON.stringify([
          { id: 'env_1', name: 'local' },
          { id: 'env_2', name: 'staging' },
        ]),
      },
    ])
    const result = await vault.environments!()
    expect(calls[0]?.args).toEqual(['environment', 'list', '--format=json'])
    expect(result).toEqual(['local', 'staging'])
  })
})

describe('OpVault.readEnvironment', () => {
  it('parses KEY=VALUE lines from `op environment read`', async () => {
    const stdout = [
      'CLERK_SECRET_KEY=sk_test_xxx',
      'NEON_DATABASE_URL=postgresql://...',
      '',
      '# comment line — ignored',
      'EMPTY_VALUE=',
    ].join('\n')
    const { vault, calls } = makeVault([{ status: 0, stdout }])
    const result = await vault.readEnvironment!('env_1')
    expect(calls[0]?.args).toEqual(['environment', 'read', 'env_1'])
    expect(result).toEqual({
      CLERK_SECRET_KEY: 'sk_test_xxx',
      NEON_DATABASE_URL: 'postgresql://...',
      EMPTY_VALUE: '',
    })
  })

  it('throws ProviderApiError when op fails', async () => {
    const { vault } = makeVault([{ status: 1, stderr: 'environment not found' }])
    await expect(vault.readEnvironment!('missing_id')).rejects.toThrow(/environment not found/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Construction
// ──────────────────────────────────────────────────────────────────────

describe('OpVault construction', () => {
  it('throws when `vault` is empty', () => {
    const { spawn } = stubSpawn([])
    const shell = new OpShell({ spawn })
    expect(() => new OpVault(shell, { vault: '' })).toThrow(/vault/)
  })
})
