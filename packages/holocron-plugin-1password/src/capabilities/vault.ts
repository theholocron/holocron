/**
 * `vault` capability for 1Password.
 *
 * Shells out to the `op` CLI for every operation. Reference format
 * is 1P's native `op://Vault/Item/field` URI.
 *
 * Write semantics: 1P doesn't have an upsert. We probe `op item get`
 * first; if it returns 0 the item exists and we `op item edit`,
 * otherwise we `op item create --category=API Credential`. The
 * fallback gives us an idempotent create-or-update without us
 * parsing edit's stderr to detect "not found".
 */

import { ProviderApiError } from '@theholocron/cli'
import type { Vault } from '@theholocron/cli'

import type { OpShell } from '../shell.js'

export interface OpVaultOptions {
  /** 1P vault name items live in. Required — list/write default here. */
  vault: string
}

interface OpEnvironment {
  id: string
  name: string
}

interface OpItem {
  id: string
  title: string
  vault?: { id: string; name: string }
}

export class OpVault implements Vault {
  readonly key = 'vault' as const
  readonly providerName = '1password'

  private readonly vaultName: string

  constructor(
    private readonly shell: OpShell,
    opts: OpVaultOptions,
  ) {
    if (!opts.vault) {
      throw new Error('OpVault requires `vault` (1P vault name) in options')
    }
    this.vaultName = opts.vault
  }

  // ── read / write ────────────────────────────────────────────────────

  async read(reference: string): Promise<string> {
    return this.shell.runOrThrow(
      ['read', reference, '--no-newline'],
      `read ${reference}`,
    )
  }

  async write(reference: string, value: string): Promise<void> {
    const parsed = parseReference(reference)
    // Probe — does the item exist?
    const probe = this.shell.run([
      'item',
      'get',
      parsed.item,
      `--vault=${parsed.vault}`,
      '--format=json',
    ])
    if (probe.ok) {
      this.shell.runOrThrow(
        ['item', 'edit', parsed.item, `--vault=${parsed.vault}`, `${parsed.field}=${value}`],
        `item edit ${parsed.item}`,
      )
      return
    }
    this.shell.runOrThrow(
      [
        'item',
        'create',
        `--title=${parsed.item}`,
        `--vault=${parsed.vault}`,
        '--category=API Credential',
        `${parsed.field}=${value}`,
      ],
      `item create ${parsed.item}`,
    )
  }

  // ── list ────────────────────────────────────────────────────────────

  async list(): Promise<string[]> {
    const stdout = this.shell.runOrThrow(
      ['item', 'list', `--vault=${this.vaultName}`, '--format=json'],
      `item list --vault=${this.vaultName}`,
    )
    if (!stdout) return []
    const parsed = JSON.parse(stdout) as OpItem[]
    return parsed.map((i) => i.title)
  }

  // ── environments ────────────────────────────────────────────────────

  async environments(): Promise<string[]> {
    const stdout = this.shell.runOrThrow(
      ['environment', 'list', '--format=json'],
      'environment list',
    )
    if (!stdout) return []
    const parsed = JSON.parse(stdout) as OpEnvironment[]
    return parsed.map((e) => e.name)
  }

  async readEnvironment(environmentId: string): Promise<Record<string, string>> {
    const stdout = this.shell.runOrThrow(
      ['environment', 'read', environmentId],
      `environment read ${environmentId}`,
    )
    return parseEnvironmentDump(stdout)
  }
}

// ── helpers ──────────────────────────────────────────────────────────

interface ParsedReference {
  vault: string
  item: string
  field: string
}

/**
 * Parse `op://Vault/Item/field` into its parts. Throws when the
 * shape doesn't match — surfacing bad inputs at the boundary keeps
 * downstream `op item edit/create` from emitting cryptic errors.
 */
function parseReference(reference: string): ParsedReference {
  if (!reference.startsWith('op://')) {
    throw new ProviderApiError(
      `1Password references must start with "op://": got "${reference}"`,
      400,
      undefined,
    )
  }
  const rest = reference.slice('op://'.length)
  const parts = rest.split('/')
  if (parts.length < 3) {
    throw new ProviderApiError(
      `1Password reference "${reference}" missing parts; expected op://Vault/Item/field`,
      400,
      undefined,
    )
  }
  const [vault, item, ...fieldParts] = parts
  return { vault: vault!, item: item!, field: fieldParts.join('/') }
}

/**
 * Parse `op environment read`'s stdout (KEY=VALUE per line) into a
 * record. Skips blank lines + `# comment` lines. Per-line format is
 * intentionally minimal — no quoting, no escaping; if a value contains
 * a literal newline, that's a problem for the underlying environment,
 * not this parser.
 */
function parseEnvironmentDump(stdout: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    out[key] = value
  }
  return out
}
