/**
 * `secrets` capability for GitHub.
 *
 * Multi-scope wrapper over GitHub Actions secrets:
 *   - `{ kind: 'repo' }`         → `/repos/{owner}/{name}/actions/secrets`
 *   - `{ kind: 'environment' }`  → `/repos/{owner}/{name}/environments/{env}/secrets`
 *   - `{ kind: 'organization' }` → `/orgs/{org}/actions/secrets`
 *
 * Each scope has its own public key (via `…/secrets/public-key`).
 * Values are encrypted with libsodium sealed-box before PUT.
 *
 * Org secrets get a default `visibility: 'all'`. The caller can
 * override via a `setOrgSecretVisibility` follow-up if a different
 * policy is needed (rare for v1; we don't expose it as a method yet).
 */

import type { Secrets, SecretScope } from '@theholocron/cli'

import { parseRepo } from '../repo.js'
import type { GitHubRestClient } from '../rest.js'
import { encryptSecret } from '../sodium.js'

export interface SecretsOptions {
  repo: string
}

interface PublicKey {
  key_id: string
  key: string
}

interface ListResponse {
  total_count: number
  secrets: Array<{ name: string }>
}

export class GitHubSecrets implements Secrets {
  readonly key = 'secrets' as const
  readonly providerName = 'github'

  private readonly repoBase: string

  constructor(
    private readonly rest: GitHubRestClient,
    opts: SecretsOptions,
  ) {
    const { owner, name } = parseRepo(opts.repo)
    this.repoBase = `/repos/${owner}/${name}`
  }

  async listSecrets(scope: SecretScope): Promise<string[]> {
    const base = this.scopeBase(scope)
    const res = await this.rest.request<ListResponse>(`${base}/secrets`)
    return res.secrets.map((s) => s.name)
  }

  async setSecret(scope: SecretScope, name: string, value: string): Promise<void> {
    const base = this.scopeBase(scope)
    const pk = await this.rest.request<PublicKey>(`${base}/secrets/public-key`)
    const encryptedValue = await encryptSecret(pk.key, value)
    const body: Record<string, unknown> = { encrypted_value: encryptedValue, key_id: pk.key_id }
    // Org secrets require a `visibility` field; default to 'all' (every
    // repo in the org). Callers can swap later via direct REST if a
    // narrower policy is needed.
    if (scope.kind === 'organization') {
      body.visibility = 'all'
    }
    await this.rest.request<void>(`${base}/secrets/${name}`, {
      method: 'PUT',
      body,
      expectNoContent: true,
    })
  }

  async deleteSecret(scope: SecretScope, name: string): Promise<void> {
    const base = this.scopeBase(scope)
    await this.rest.request<void>(`${base}/secrets/${name}`, {
      method: 'DELETE',
      expectNoContent: true,
    })
  }

  /** Endpoint root for the given scope. */
  private scopeBase(scope: SecretScope): string {
    switch (scope.kind) {
      case 'repo':
        return `${this.repoBase}/actions`
      case 'environment':
        return `${this.repoBase}/environments/${scope.name}`
      case 'organization':
        return `/orgs/${scope.name}/actions`
    }
  }
}
