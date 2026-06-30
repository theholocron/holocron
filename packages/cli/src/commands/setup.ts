/**
 * `holocron setup` — orchestrates per-capability setup actions across
 * every plugin loaded from `holocron.config.json`.
 *
 * Per CLAUDE.md soft-skip: each step is wrapped in a try/catch and
 * failures don't abort subsequent capabilities. The summary at the end
 * reports counts so the operator can see what worked + what didn't.
 *
 * Per the Standards: when `ctx.dryRun` is true, mutating calls are
 * replaced with "would" log lines. Read-only probes (e.g.,
 * `vault.list`) still run so the operator sees real state.
 *
 * The orchestrator knows about specific capability methods by name
 * (e.g., `source.enableVulnerabilityAlerts`). This deliberate coupling
 * makes the "what does setup do" contract explicit and concrete —
 * decoupling via a per-capability `setupSteps()` method would be more
 * extensible but pushes the same knowledge into N plugins instead of
 * one central place.
 */

import type {
  Auth,
  Deployment,
  Environments,
  Source,
  Tooling,
  Vault,
} from '../capabilities/index.js'
import type { LoadedConfig } from '../load-config.js'
import { PluginLoader, type RuntimeContext } from '../loader.js'

export type SetupPrintLine = (line: string) => void

export type SetupStatus = 'ok' | 'fail' | 'skip' | 'dry-run'

export interface SetupStepResult {
  capability: string
  step: string
  status: SetupStatus
  message?: string
}

export interface SetupReport {
  steps: SetupStepResult[]
  summary: { ok: number; fail: number; skip: number; dryRun: number }
}

export interface RunSetupInput {
  loaded: LoadedConfig
  context: RuntimeContext
  /** Lets tests inject a pre-loaded loader; defaults to native dynamic import. */
  loader?: PluginLoader
  print?: SetupPrintLine
}

export async function runSetup(input: RunSetupInput): Promise<SetupReport> {
  const print = input.print ?? ((line: string) => console.log(line))
  const loader =
    input.loader ?? new PluginLoader(input.loaded.resolved, input.context)
  await loader.load()

  const config = input.loaded.resolved
  const dryRun = input.context.dryRun ?? false
  const steps: SetupStepResult[] = []

  print(`Holocron setup — ${config.project.name}${dryRun ? ' (dry-run)' : ''}`)
  print(`  config: ${input.loaded.filepath}`)
  print('')

  // ── source: security toggles ────────────────────────────────────────
  if (loader.has('source')) {
    const source = loader.get('source') as Source
    print('  → source')
    for (const method of [
      'enableVulnerabilityAlerts',
      'enableAutomatedSecurityFixes',
      'enableSecretScanning',
      'enablePrivateVulnerabilityReporting',
    ] as const) {
      steps.push(
        await runStep('source', method, dryRun, async () => {
          await source[method]()
        }),
      )
      print(formatStep(steps[steps.length - 1]!))
    }
  }

  // ── environments ────────────────────────────────────────────────────
  if (loader.has('environments')) {
    const envs = loader.get('environments') as Environments
    print('  → environments')
    for (const envName of ['staging', 'production']) {
      steps.push(
        await runStep('environments', `upsert ${envName}`, dryRun, async () => {
          await envs.upsertEnvironment({ name: envName })
        }),
      )
      print(formatStep(steps[steps.length - 1]!))
    }
  }

  // ── deployment: ensure project ──────────────────────────────────────
  if (loader.has('deployment')) {
    const deploy = loader.get('deployment') as Deployment
    print('  → deployment')
    steps.push(
      await runStep(
        'deployment',
        `ensureProject ${config.project.name}`,
        dryRun,
        async () => {
          await deploy.ensureProject({ name: config.project.name })
        },
      ),
    )
    print(formatStep(steps[steps.length - 1]!))
  }

  // ── auth: ensure webhook app (optional method) ──────────────────────
  if (loader.has('auth')) {
    const auth = loader.get('auth') as Auth
    print('  → auth')
    if (auth.ensureWebhookApp) {
      steps.push(
        await runStep('auth', 'ensureWebhookApp', dryRun, async () => {
          const result = await auth.ensureWebhookApp!()
          return `webhook ${result.alreadyExists ? 'exists' : 'created'}`
        }),
      )
      print(formatStep(steps[steps.length - 1]!))
    } else {
      steps.push({
        capability: 'auth',
        step: 'ensureWebhookApp',
        status: 'skip',
        message: 'provider does not implement ensureWebhookApp',
      })
      print(formatStep(steps[steps.length - 1]!))
    }
  }

  // ── vault: read-only probe (no automation) ──────────────────────────
  if (loader.has('vault')) {
    const vault = loader.get('vault') as Vault
    print('  → vault')
    // Always runs even in dry-run — it's read-only.
    try {
      const keys = await vault.list()
      steps.push({
        capability: 'vault',
        step: 'list',
        status: 'ok',
        message: `${keys.length} keys available`,
      })
    } catch (err) {
      steps.push({
        capability: 'vault',
        step: 'list',
        status: 'fail',
        message: err instanceof Error ? err.message : String(err),
      })
    }
    print(formatStep(steps[steps.length - 1]!))
  }

  // ── tooling: sync each (many cardinality) ───────────────────────────
  if (loader.has('tooling')) {
    const tools = loader.get('tooling') as Tooling[]
    print('  → tooling')
    for (const tool of tools) {
      steps.push(
        await runStep('tooling', `${tool.providerName}.sync`, dryRun, async () => {
          await tool.sync()
        }),
      )
      print(formatStep(steps[steps.length - 1]!))
    }
  }

  const summary = steps.reduce(
    (acc, s) => {
      if (s.status === 'ok') acc.ok += 1
      else if (s.status === 'fail') acc.fail += 1
      else if (s.status === 'skip') acc.skip += 1
      else if (s.status === 'dry-run') acc.dryRun += 1
      return acc
    },
    { ok: 0, fail: 0, skip: 0, dryRun: 0 },
  )

  print('')
  print(
    `  ${summary.ok} ok, ${summary.fail} fail, ${summary.skip} skipped${
      dryRun ? `, ${summary.dryRun} would-do` : ''
    }`,
  )

  return { steps, summary }
}

// ── helpers ──────────────────────────────────────────────────────────

async function runStep(
  capability: string,
  step: string,
  dryRun: boolean,
  body: () => Promise<string | void>,
): Promise<SetupStepResult> {
  if (dryRun) {
    return { capability, step, status: 'dry-run' }
  }
  try {
    const note = await body()
    const result: SetupStepResult = { capability, step, status: 'ok' }
    if (typeof note === 'string') result.message = note
    return result
  } catch (err) {
    return {
      capability,
      step,
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

function formatStep(step: SetupStepResult): string {
  const icon =
    step.status === 'ok'
      ? '✓'
      : step.status === 'fail'
        ? '✗'
        : step.status === 'dry-run'
          ? '…'
          : '·'
  const detail = step.message ? `  (${step.message})` : ''
  return `    ${icon} ${step.step}${detail}`
}
