/**
 * `storage` capability for Neon.
 *
 * Ported from rando-id/rando.id `adapters/neon.ts`, bound to a single
 * Neon project (the `projectId` plugin option). All methods operate
 * within that project.
 *
 * Branch ops use Neon's REST API directly. `enableExtension` runs SQL
 * against the branch's default database via the `run_sql` endpoint —
 * Neon doesn't have a dedicated "create extension" endpoint, so this
 * goes through SQL.
 *
 * Project-create is deliberately omitted: Vercel-managed Neon orgs
 * reject create at the API level, and the recipe (`vercel install neon`
 * → wait for project to appear → bind by id) is unavoidable for those
 * setups. The plugin assumes the project already exists and is bound
 * via `projectId` in options.
 */

import { ProviderApiError } from '@theholocron/cli'
import type {
  ConnectionStringOptions,
  Storage,
  StorageBranch,
} from '@theholocron/cli'

import type { NeonRestClient } from '../rest.js'

export interface StorageOptions {
  projectId: string
}

interface NeonBranchShape {
  id: string
  name: string
  parent_id?: string
  created_at: string
}

interface NeonDbShape {
  id: number
  name: string
  owner_name: string
}

export class NeonStorage implements Storage {
  readonly key = 'storage' as const
  readonly providerName = 'neon'

  private readonly base: string

  constructor(
    private readonly rest: NeonRestClient,
    opts: StorageOptions,
  ) {
    if (!opts.projectId) {
      throw new Error('NeonStorage requires `projectId` in options')
    }
    this.base = `/projects/${opts.projectId}`
  }

  // ── connection string ───────────────────────────────────────────────

  async getConnectionString(
    scope: string,
    options: ConnectionStringOptions = {},
  ): Promise<string> {
    // Neon's /connection_uri needs the default db name + role name. Look
    // up the branch's databases first; first one is the default.
    const db = await this.firstDatabase(scope)
    const params = {
      branch_id: scope,
      database_name: db.name,
      role_name: db.owner_name,
      pooled: options.pooled ? 'true' : 'false',
    }
    const body = await this.rest.request<{ uri: string }>(`${this.base}/connection_uri`, {
      query: params,
    })
    return body.uri
  }

  // ── branch ops ──────────────────────────────────────────────────────

  async listBranches(): Promise<StorageBranch[]> {
    const body = await this.rest.request<{ branches: NeonBranchShape[] }>(
      `${this.base}/branches`,
    )
    return body.branches.map(mapBranch)
  }

  async createBranch(input: { name: string; from?: string }): Promise<StorageBranch> {
    // Provision a read_write endpoint inline. Without it, /connection_uri
    // returns "endpoint not found" on a freshly-created branch.
    const body = await this.rest.request<{ branch: NeonBranchShape }>(
      `${this.base}/branches`,
      {
        method: 'POST',
        body: {
          branch: {
            name: input.name,
            ...(input.from ? { parent_id: input.from } : {}),
          },
          endpoints: [{ type: 'read_write' }],
        },
      },
    )
    return mapBranch(body.branch)
  }

  async destroyBranch(branch: string): Promise<void> {
    await this.rest.request<void>(`${this.base}/branches/${encodeURIComponent(branch)}`, {
      method: 'DELETE',
    })
  }

  async resetBranch(input: { branch: string; from: string }): Promise<void> {
    // Neon's "Restore branch" endpoint resets the target branch to match
    // the state of another branch. Reversible via Neon's auto-backup.
    await this.rest.request<void>(
      `${this.base}/branches/${encodeURIComponent(input.branch)}/restore`,
      {
        method: 'POST',
        body: { source_branch_id: input.from },
      },
    )
  }

  async enableExtension(input: { branch: string; extension: string }): Promise<void> {
    const db = await this.firstDatabase(input.branch)
    await this.rest.request<void>(
      `${this.base}/branches/${encodeURIComponent(
        input.branch,
      )}/databases/${encodeURIComponent(db.name)}/run_sql`,
      {
        method: 'POST',
        body: { query: `CREATE EXTENSION IF NOT EXISTS "${input.extension}"` },
      },
    )
  }

  // ── internals ───────────────────────────────────────────────────────

  /**
   * The first database on a branch — the "default" for connection-string
   * and extension purposes. Throws if the branch has no databases (which
   * means it was created without an endpoint and needs initialization).
   */
  private async firstDatabase(branchId: string): Promise<NeonDbShape> {
    const body = await this.rest.request<{ databases: NeonDbShape[] }>(
      `${this.base}/branches/${encodeURIComponent(branchId)}/databases`,
    )
    const db = body.databases[0]
    if (!db) {
      throw new ProviderApiError(
        `Neon branch ${branchId} has no databases — initialize the branch first`,
        404,
        undefined,
      )
    }
    return db
  }
}

function mapBranch(raw: NeonBranchShape): StorageBranch {
  return {
    id: raw.id,
    name: raw.name,
    parentId: raw.parent_id ?? null,
    createdAt: raw.created_at,
  }
}
