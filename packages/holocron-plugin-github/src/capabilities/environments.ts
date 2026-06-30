/**
 * `environments` capability for GitHub.
 *
 * Wraps `/repos/{owner}/{name}/environments`. PUT is idempotent —
 * creates if absent, updates if present. The reviewer API requires
 * numeric ids; logins are silently ignored (preserved from Rando's
 * gh-rest port).
 */

import type { Environment, Environments } from '@theholocron/cli'

import { parseRepo } from '../repo.js'
import type { GitHubRestClient } from '../rest.js'

export interface EnvironmentsOptions {
  repo: string
}

interface ListResponse {
  total_count: number
  environments: Array<{
    name: string
    wait_timer?: number
    prevent_self_review?: boolean
    protection_rules?: Array<{
      type: string
      reviewers?: Array<{
        type: 'User' | 'Team'
        reviewer: { id: number }
      }>
    }>
  }>
}

export class GitHubEnvironments implements Environments {
  readonly key = 'environments' as const
  readonly providerName = 'github'

  private readonly base: string

  constructor(
    private readonly rest: GitHubRestClient,
    opts: EnvironmentsOptions,
  ) {
    const { owner, name } = parseRepo(opts.repo)
    this.base = `/repos/${owner}/${name}/environments`
  }

  async listEnvironments(): Promise<Environment[]> {
    const res = await this.rest.request<ListResponse>(this.base)
    return res.environments.map((e) => ({
      name: e.name,
      waitTimer: e.wait_timer,
      preventSelfReview: e.prevent_self_review,
      reviewers: this.flattenReviewers(e.protection_rules),
    }))
  }

  async upsertEnvironment(env: Environment): Promise<void> {
    const body: Record<string, unknown> = {}
    if (env.waitTimer !== undefined) body.wait_timer = env.waitTimer
    if (env.preventSelfReview !== undefined) body.prevent_self_review = env.preventSelfReview
    if (env.reviewers !== undefined) {
      // GitHub's reviewer API silently ignores `login`; the numeric id
      // is what actually wires. Callers are expected to resolve logins
      // to ids ahead of time.
      body.reviewers = env.reviewers.map((r) => ({ type: r.type, id: r.id }))
    }
    await this.rest.request<void>(`${this.base}/${encodeURIComponent(env.name)}`, {
      method: 'PUT',
      body,
    })
  }

  async deleteEnvironment(name: string): Promise<void> {
    await this.rest.request<void>(`${this.base}/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      expectNoContent: true,
    })
  }

  private flattenReviewers(
    rules: ListResponse['environments'][number]['protection_rules'],
  ): Environment['reviewers'] {
    if (!rules) return undefined
    const reviewersRule = rules.find((r) => r.type === 'required_reviewers')
    if (!reviewersRule?.reviewers) return undefined
    return reviewersRule.reviewers.map((r) => ({ type: r.type, id: r.reviewer.id }))
  }
}
