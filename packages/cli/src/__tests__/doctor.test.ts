import { describe, expect, it, vi } from 'vitest'

import type { CapabilityKey } from '../capabilities/index.js'
import { runDoctor } from '../commands/doctor.js'
import { resolveConfig } from '../config.js'
import type { LoadedConfig } from '../load-config.js'
import { PluginLoader, type PluginImporter } from '../loader.js'

function loadedFrom(rawConfig: Parameters<typeof resolveConfig>[0]): LoadedConfig {
  return {
    resolved: resolveConfig(rawConfig),
    filepath: '/tmp/test/holocron.config.json',
  }
}

function makePlugin(name: string, caps: Record<string, unknown>) {
  return {
    createPlugin: (_opts: Record<string, unknown>) => ({
      name,
      capabilities: Object.fromEntries(
        Object.entries(caps).map(([k, impl]) => [k, () => impl]),
      ),
    }),
  }
}

function makeLoaderWith(
  loaded: LoadedConfig,
  modules: Record<string, unknown>,
): PluginLoader {
  const importer = vi.fn(async (pkg: string) => {
    if (!(pkg in modules)) throw new Error(`MODULE_NOT_FOUND: ${pkg}`)
    return modules[pkg] as Awaited<ReturnType<PluginImporter>>
  })
  return new PluginLoader(
    loaded.resolved,
    { repoRoot: '/tmp/test', repo: 'theholocron/holocron' },
    importer as unknown as PluginImporter,
  )
}

describe('runDoctor', () => {
  it('reports ok for source.whoami succeeding', async () => {
    const lines: string[] = []
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', source: 'github' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => ['ONE', 'TWO'] },
      }),
      '@theholocron/holocron-plugin-github': makePlugin('gh', {
        source: { whoami: async () => ({ login: 'iamnewton' }) },
      }),
    })

    const report = await runDoctor({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: (l) => lines.push(l),
    })

    const sourceRow = report.rows.find((r) => r.capability === 'source')
    expect(sourceRow).toMatchObject({ status: 'ok' })
    expect(sourceRow?.message).toContain('iamnewton')

    const vaultRow = report.rows.find((r) => r.capability === 'vault')
    expect(vaultRow?.status).toBe('ok')
    expect(vaultRow?.message).toContain('2 keys')

    expect(report.summary).toEqual({ ok: 2, fail: 0, skip: 0 })
    expect(lines.join('\n')).toContain('Holocron doctor — demo')
  })

  it('reports fail when a smoke check throws', async () => {
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', source: 'github' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-github': makePlugin('gh', {
        source: {
          whoami: async () => {
            throw new Error('401 Unauthorized')
          },
        },
      }),
    })

    const report = await runDoctor({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    const sourceRow = report.rows.find((r) => r.capability === 'source')
    expect(sourceRow?.status).toBe('fail')
    expect(sourceRow?.message).toContain('401 Unauthorized')
    expect(report.summary).toEqual({ ok: 1, fail: 1, skip: 0 })
  })

  it('reports skip for many-cardinality capabilities (no smoke endpoint yet)', async () => {
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: {
        vault: '1password',
        notifications: ['slack', 'discord'],
      },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-slack': makePlugin('slack', { notifications: {} }),
      '@theholocron/holocron-plugin-discord': makePlugin('discord', { notifications: {} }),
    })

    const report = await runDoctor({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    const notifRows = report.rows.filter((r) => r.capability === 'notifications')
    expect(notifRows).toHaveLength(2)
    expect(notifRows.every((r) => r.status === 'skip')).toBe(true)
    expect(notifRows.map((r) => r.provider)).toEqual(['slack', 'discord'])
  })

  it('issues smoke check reports resolved lifecycle slot count', async () => {
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', issues: 'github' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-github': makePlugin('gh', {
        issues: {
          doctor: async () => ({
            authedAs: 'Newton (iamnewton)',
            projectLabel: 'Repo: x/y',
            statuses: [],
            lifecycle: [
              { slot: 'inProgress' as const, value: 'a', resolved: true, note: '' },
              { slot: 'inReview' as const, value: 'b', resolved: false, note: '' },
              { slot: 'done' as const, value: 'c', resolved: true, note: '' },
            ],
          }),
        },
      }),
    })

    const report = await runDoctor({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    const issuesRow = report.rows.find((r) => r.capability === ('issues' satisfies CapabilityKey))
    expect(issuesRow?.message).toContain('2/3 lifecycle slots ready')
  })
})
