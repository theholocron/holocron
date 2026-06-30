import { describe, expect, it, vi } from 'vitest'

import { resolveConfig } from '../config.js'
import { runSetup } from '../commands/setup.js'
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

function makeLoaderWith(loaded: LoadedConfig, modules: Record<string, unknown>): PluginLoader {
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

describe('runSetup', () => {
  it('runs the four source security toggles + reports ok for each', async () => {
    const calls: string[] = []
    const source = {
      enableVulnerabilityAlerts: async () => {
        calls.push('vuln-alerts')
      },
      enableAutomatedSecurityFixes: async () => {
        calls.push('auto-sec-fixes')
      },
      enableSecretScanning: async () => {
        calls.push('secret-scan')
      },
      enablePrivateVulnerabilityReporting: async () => {
        calls.push('private-vuln')
      },
    }
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', source: 'github' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-github': makePlugin('gh', { source }),
    })

    const report = await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    expect(calls).toEqual(['vuln-alerts', 'auto-sec-fixes', 'secret-scan', 'private-vuln'])
    const sourceSteps = report.steps.filter((s) => s.capability === 'source')
    expect(sourceSteps).toHaveLength(4)
    expect(sourceSteps.every((s) => s.status === 'ok')).toBe(true)
  })

  it('soft-skips failed steps (continues subsequent capabilities)', async () => {
    const calls: string[] = []
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', source: 'github' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: {
          list: async () => {
            calls.push('vault-list')
            return ['SECRET_A']
          },
        },
      }),
      '@theholocron/holocron-plugin-github': makePlugin('gh', {
        source: {
          enableVulnerabilityAlerts: async () => {
            throw new Error('403 forbidden')
          },
          enableAutomatedSecurityFixes: async () => {
            calls.push('auto-sec-fixes')
          },
          enableSecretScanning: async () => {
            calls.push('secret-scan')
          },
          enablePrivateVulnerabilityReporting: async () => {
            calls.push('private-vuln')
          },
        },
      }),
    })

    const report = await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    expect(calls).toContain('vault-list')
    expect(calls).toContain('auto-sec-fixes') // ran AFTER the failure
    const firstSource = report.steps.find((s) => s.step === 'enableVulnerabilityAlerts')
    expect(firstSource?.status).toBe('fail')
    expect(firstSource?.message).toContain('403 forbidden')
    expect(report.summary.fail).toBe(1)
    expect(report.summary.ok).toBeGreaterThanOrEqual(4)
  })

  it('dry-run reports `dry-run` status without calling mutators', async () => {
    let called = false
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', source: 'github' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => ['X', 'Y'] },
      }),
      '@theholocron/holocron-plugin-github': makePlugin('gh', {
        source: {
          enableVulnerabilityAlerts: async () => {
            called = true
          },
          enableAutomatedSecurityFixes: async () => {
            called = true
          },
          enableSecretScanning: async () => {
            called = true
          },
          enablePrivateVulnerabilityReporting: async () => {
            called = true
          },
        },
      }),
    })

    const report = await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test', dryRun: true },
      loader,
      print: () => {},
    })

    expect(called).toBe(false) // mutators never ran
    const sourceSteps = report.steps.filter((s) => s.capability === 'source')
    expect(sourceSteps.every((s) => s.status === 'dry-run')).toBe(true)
    // Vault list still runs (read-only) even in dry-run.
    expect(report.steps.find((s) => s.capability === 'vault')?.status).toBe('ok')
  })

  it('upserts staging + production environments when the capability is loaded', async () => {
    const created: string[] = []
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', environments: 'github' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-github': makePlugin('gh', {
        environments: {
          upsertEnvironment: async (env: { name: string }) => {
            created.push(env.name)
          },
        },
      }),
    })

    await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    expect(created).toEqual(['staging', 'production'])
  })

  it('ensures the deployment project using the config project name', async () => {
    let ensuredName: string | null = null
    const loaded = loadedFrom({
      project: { name: 'my-app' },
      providers: { vault: '1password', deployment: 'vercel' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-vercel': makePlugin('vercel', {
        deployment: {
          ensureProject: async (input: { name: string }) => {
            ensuredName = input.name
            return { id: 'prj_1', name: input.name }
          },
        },
      }),
    })

    await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    expect(ensuredName).toBe('my-app')
  })

  it('reports already-exists for ensureWebhookApp when the provider supports it', async () => {
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', auth: 'clerk' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-clerk': makePlugin('clerk', {
        auth: {
          ensureWebhookApp: async () => ({ alreadyExists: true }),
        },
      }),
    })

    const report = await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    const authStep = report.steps.find((s) => s.capability === 'auth')
    expect(authStep?.status).toBe('ok')
    expect(authStep?.message).toContain('exists')
  })

  it('skips auth setup when the provider does not implement ensureWebhookApp', async () => {
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', auth: 'clerk' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-clerk': makePlugin('clerk', {
        auth: {
          // Note: no ensureWebhookApp
        },
      }),
    })

    const report = await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    const authStep = report.steps.find((s) => s.capability === 'auth')
    expect(authStep?.status).toBe('skip')
    expect(report.summary.skip).toBeGreaterThanOrEqual(1)
  })

  it('runs sync() once per tooling provider (many-cardinality)', async () => {
    const synced: string[] = []
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password', tooling: ['postman', 'storybook'] },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => [] },
      }),
      '@theholocron/holocron-plugin-postman': makePlugin('postman', {
        tooling: {
          providerName: 'postman',
          sync: async () => {
            synced.push('postman')
          },
        },
      }),
      '@theholocron/holocron-plugin-storybook': makePlugin('storybook', {
        tooling: {
          providerName: 'storybook',
          sync: async () => {
            synced.push('storybook')
          },
        },
      }),
    })

    await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: () => {},
    })

    expect(synced).toEqual(['postman', 'storybook'])
  })

  it('output includes a header + summary line', async () => {
    const lines: string[] = []
    const loaded = loadedFrom({
      project: { name: 'demo' },
      providers: { vault: '1password' },
    })
    const loader = makeLoaderWith(loaded, {
      '@theholocron/holocron-plugin-1password': makePlugin('1p', {
        vault: { list: async () => ['ONE'] },
      }),
    })

    await runSetup({
      loaded,
      context: { repoRoot: '/tmp/test' },
      loader,
      print: (l) => lines.push(l),
    })

    const joined = lines.join('\n')
    expect(joined).toMatch(/Holocron setup — demo/)
    expect(joined).toMatch(/1 ok, 0 fail/)
  })
})
