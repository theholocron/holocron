/**
 * `holocron deploy` — trigger a deployment via the configured
 * `deployment` capability.
 *
 * Errors clearly when `deployment` isn't loaded (no provider declared
 * in `holocron.config.json`). Returns the resulting deployment record
 * so callers can print the URL + status.
 *
 * Dry-run skips the actual triggerDeployment call but still verifies
 * the deployment capability is present, so operators can sanity-check
 * the wiring without spinning up a build.
 */

import type { Deployment, DeploymentRecord, DeploymentTrigger } from '../capabilities/index.js'
import type { LoadedConfig } from '../load-config.js'
import { PluginLoader, type RuntimeContext } from '../loader.js'

export type DeployPrintLine = (line: string) => void

export interface RunDeployInput {
  loaded: LoadedConfig
  context: RuntimeContext
  /** Vendor project id (e.g., Vercel prj_*). Required. */
  projectId: string
  /** Git branch to deploy. */
  branch: string
  /** Named target — `undefined` means branch preview. */
  target?: DeploymentTrigger
  loader?: PluginLoader
  print?: DeployPrintLine
}

export interface DeployReport {
  /** Null in dry-run mode (no actual deployment was triggered). */
  deployment: DeploymentRecord | null
  status: 'ok' | 'fail' | 'dry-run'
  message?: string
}

export async function runDeploy(input: RunDeployInput): Promise<DeployReport> {
  const print = input.print ?? ((line: string) => console.log(line))
  const loader =
    input.loader ?? new PluginLoader(input.loaded.resolved, input.context)
  await loader.load()

  const dryRun = input.context.dryRun ?? false

  print(
    `Holocron deploy — branch=${input.branch}${
      input.target ? `, target=${input.target}` : ' (preview)'
    }${dryRun ? ' (dry-run)' : ''}`,
  )

  if (!loader.has('deployment')) {
    throw new Error(
      'deployment capability is not configured — add a `deployment` provider to holocron.config.json',
    )
  }
  const deploy = loader.get('deployment') as Deployment

  if (dryRun) {
    const message = `would: ${deploy.providerName}.triggerDeployment(projectId=${input.projectId}, branch=${input.branch}${
      input.target ? `, target=${input.target}` : ''
    })`
    print(`  … ${message}`)
    return { deployment: null, status: 'dry-run', message }
  }

  try {
    const record = await deploy.triggerDeployment({
      projectId: input.projectId,
      branch: input.branch,
      ...(input.target ? { target: input.target } : {}),
    })
    print(`  ✓ ${record.status} — ${record.url}`)
    return { deployment: record, status: 'ok' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    print(`  ✗ ${message}`)
    return { deployment: null, status: 'fail', message }
  }
}
