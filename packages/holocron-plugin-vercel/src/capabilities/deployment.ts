/**
 * `deployment` capability for Vercel.
 *
 * Ported from rando-id/rando.id `packages/cli/src/adapters/vercel.ts`,
 * adapted to the holocron `Deployment` interface:
 *
 *   - `ensureProject` is the idempotent create (GET-then-POST), since
 *     `holocron setup` re-runs on every invocation
 *   - `setEnvVar` uses Vercel's `upsert=true` so it's idempotent
 *     create-or-update
 *   - `triggerDeployment` infers a branch preview when `target` is
 *     omitted; named targets ('production' / 'staging') opt into
 *     environment-scoped deploys
 *
 * Vercel encrypts env-var values at rest server-side; we send them as
 * `type: 'encrypted'`. Unlike GitHub Actions secrets, there's no
 * sealed-box / libsodium step on the client.
 */

import { ProviderApiError } from '@theholocron/cli'
import type {
  Deployment,
  DeploymentProject,
  DeploymentProjectSettings,
  DeploymentRecord,
  DeploymentTarget,
  DeploymentTrigger,
} from '@theholocron/cli'

import type { VercelRestClient } from '../rest.js'

export interface DeploymentOptions {
  /** Optional framework hint passed to project creates. Defaults to "nextjs". */
  defaultFramework?: string
}

interface VercelProjectShape {
  id: string
  name: string
  framework?: string | null
  rootDirectory?: string | null
  link?: { type?: string; repoId?: number; repo?: string; org?: string } | null
}

interface VercelEnvShape {
  id: string
  key: string
  target: DeploymentTarget[]
}

interface VercelDeploymentShape {
  id: string
  url: string
  readyState: 'INITIALIZING' | 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED'
  target?: DeploymentTrigger | null
  meta?: { githubCommitRef?: string }
}

export class VercelDeployment implements Deployment {
  readonly key = 'deployment' as const
  readonly providerName = 'vercel'

  private readonly defaultFramework: string

  constructor(
    private readonly rest: VercelRestClient,
    opts: DeploymentOptions = {},
  ) {
    this.defaultFramework = opts.defaultFramework ?? 'nextjs'
  }

  // ── projects ────────────────────────────────────────────────────────

  async listProjects(): Promise<DeploymentProject[]> {
    const result = await this.rest.request<{ projects: VercelProjectShape[] }>(
      '/v10/projects',
    )
    return result.projects.map(mapProject)
  }

  async ensureProject(input: {
    name: string
    framework?: string
    repo?: string
    rootDirectory?: string
  }): Promise<DeploymentProject> {
    const existing = await this.getProjectByName(input.name)
    if (existing) return existing

    const body: Record<string, unknown> = {
      name: input.name,
      framework: input.framework ?? this.defaultFramework,
    }
    if (input.repo) {
      body.gitRepository = { type: 'github', repo: input.repo }
    }
    if (input.rootDirectory) {
      body.rootDirectory = input.rootDirectory
    }
    const result = await this.rest.request<VercelProjectShape>('/v11/projects', {
      method: 'POST',
      body,
    })
    return mapProject(result)
  }

  async updateProjectSettings(
    projectId: string,
    settings: DeploymentProjectSettings,
  ): Promise<DeploymentProject> {
    const body: Record<string, unknown> = {}
    if (settings.previewDeploymentsDisabled !== undefined) {
      body.previewDeploymentsDisabled = settings.previewDeploymentsDisabled
    }
    if (settings.gitProviderCreateDeployments !== undefined) {
      body.gitProviderOptions = {
        createDeployments: settings.gitProviderCreateDeployments,
      }
    }
    const result = await this.rest.request<VercelProjectShape>(
      `/v9/projects/${encodeURIComponent(projectId)}`,
      { method: 'PATCH', body },
    )
    return mapProject(result)
  }

  // ── env vars ────────────────────────────────────────────────────────

  async listEnvVars(projectId: string, target: DeploymentTarget): Promise<string[]> {
    const result = await this.rest.request<{ envs: VercelEnvShape[] }>(
      `/v9/projects/${encodeURIComponent(projectId)}/env`,
    )
    return result.envs.filter((e) => e.target.includes(target)).map((e) => e.key)
  }

  async setEnvVar(
    projectId: string,
    target: DeploymentTarget,
    name: string,
    value: string,
  ): Promise<void> {
    // upsert=true → create if missing, update if present (idempotent).
    await this.rest.request<VercelEnvShape>(
      `/v10/projects/${encodeURIComponent(projectId)}/env`,
      {
        method: 'POST',
        query: { upsert: 'true' },
        body: {
          key: name,
          value,
          target: [target],
          type: 'encrypted',
        },
      },
    )
  }

  // ── deployments ─────────────────────────────────────────────────────

  async triggerDeployment(input: {
    projectId: string
    branch: string
    target?: DeploymentTrigger
  }): Promise<DeploymentRecord> {
    // Vercel needs the GitHub `repoId` on the linked project to fire a
    // branch deploy via the REST API. Look it up first; if absent, the
    // project isn't linked to a Git provider and we can't trigger.
    const project = await this.rest.request<VercelProjectShape>(
      `/v10/projects/${encodeURIComponent(input.projectId)}`,
    )
    const repoId = project.link?.repoId
    if (!repoId) {
      throw new ProviderApiError(
        `Vercel project "${project.name}" has no linked GitHub repo — cannot trigger a deployment. Link the repo first.`,
        400,
        undefined,
      )
    }
    const raw = await this.rest.request<VercelDeploymentShape>('/v13/deployments', {
      method: 'POST',
      body: {
        name: project.name,
        gitSource: { type: 'github', ref: input.branch, repoId },
        ...(input.target ? { target: input.target } : {}),
      },
    })
    return mapDeployment(raw, input.branch)
  }

  async getDeployment(deploymentId: string): Promise<DeploymentRecord> {
    const raw = await this.rest.request<VercelDeploymentShape>(
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    )
    return mapDeployment(raw, raw.meta?.githubCommitRef ?? null)
  }

  // ── internals ───────────────────────────────────────────────────────

  /** GET project by name with 404→null soft-skip. */
  private async getProjectByName(name: string): Promise<DeploymentProject | null> {
    try {
      const result = await this.rest.request<VercelProjectShape>(
        `/v10/projects/${encodeURIComponent(name)}`,
      )
      return mapProject(result)
    } catch (err) {
      if (err instanceof ProviderApiError && err.status === 404) return null
      throw err
    }
  }
}

// ── mappers ──────────────────────────────────────────────────────────

function mapProject(raw: VercelProjectShape): DeploymentProject {
  const project: DeploymentProject = {
    id: raw.id,
    name: raw.name,
    gitLinked: Boolean(raw.link?.repoId),
    rootDirectory: raw.rootDirectory ?? null,
  }
  if (raw.framework) project.framework = raw.framework
  return project
}

function mapDeployment(
  raw: VercelDeploymentShape,
  branch: string | null,
): DeploymentRecord {
  const record: DeploymentRecord = {
    id: raw.id,
    url: raw.url,
    branch,
    status: normalizeState(raw.readyState),
  }
  if (raw.target) record.target = raw.target
  return record
}

function normalizeState(s: VercelDeploymentShape['readyState']): DeploymentRecord['status'] {
  switch (s) {
    case 'INITIALIZING':
    case 'QUEUED':
      return 'queued'
    case 'BUILDING':
      return 'building'
    case 'READY':
      return 'ready'
    case 'ERROR':
      return 'error'
    case 'CANCELED':
      return 'cancelled'
  }
}
