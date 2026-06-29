/**
 * `issues` capability for GitHub.
 *
 * Ported from rando-id/rando.id `packages/cli/src/adapters/github-issues.ts`
 * with the v2 shape adjustments captured in the architecture spec.
 *
 * Lifecycle model: GitHub Issues has no transitions like Jira does.
 * Holocron's three lifecycle slots map to (state, label) pairs:
 *   inProgress → open + label `status:in-progress`  (strip other status:*)
 *   inReview   → open + label `status:in-review`    (strip other status:*)
 *   done       → closed (state_reason=completed)    (strip status:* labels)
 *
 * Issue keys accept "#42", "42", or "owner/repo#42" on input; the
 * canonical display key is always "#N".
 */

import type {
  Issue,
  IssueSearchFilter,
  Issues,
  LifecycleResult,
  LifecycleSlot,
  StatusCategory,
  TrackerDoctorReport,
  TrackerUser,
} from '@theholocron/cli'

import { parseRepo } from '../repo.js'
import type { GitHubRestClient } from '../rest.js'

export interface IssuesOptions {
  repo: string
  /** Lifecycle slot → status label name. */
  labels: { inProgress: string; inReview: string }
}

interface RawUser {
  login: string
  name?: string | null
  email?: string | null
}

interface RawIssue {
  id: number
  number: number
  title: string
  body?: string | null
  state: 'open' | 'closed'
  labels: Array<{ name: string }>
  assignee: RawUser | null
  updated_at: string
  html_url: string
  /** Present when the "issue" is actually a PR. We filter these out. */
  pull_request?: unknown
}

interface RawRepo {
  full_name: string
}

interface RawMilestone {
  number: number
  title: string
}

export class GitHubIssues implements Issues {
  readonly key = 'issues' as const
  readonly providerName = 'github'

  private readonly owner: string
  private readonly repoName: string
  private readonly base: string
  private readonly labels: { inProgress: string; inReview: string }

  constructor(
    private readonly rest: GitHubRestClient,
    opts: IssuesOptions,
  ) {
    const { owner, name } = parseRepo(opts.repo)
    this.owner = owner
    this.repoName = name
    this.base = `/repos/${owner}/${name}`
    this.labels = opts.labels
  }

  // ── identity ─────────────────────────────────────────────────────────

  async getMyself(): Promise<TrackerUser> {
    const raw = await this.rest.request<RawUser>('/user')
    return mapUser(raw)
  }

  // ── search / get ─────────────────────────────────────────────────────

  async search(filter: IssueSearchFilter): Promise<Issue[]> {
    const params = new URLSearchParams({
      state: filter.openOnly ? 'open' : 'all',
      sort: 'updated',
      direction: 'desc',
      per_page: String(filter.limit ?? 50),
      filter: 'all',
    })
    if (filter.assignee === 'currentUser') {
      const me = await this.getMyself()
      params.set('assignee', me.id)
    } else if (filter.assignee) {
      params.set('assignee', filter.assignee)
    }
    const raw = await this.rest.request<RawIssue[]>(
      `${this.base}/issues?${params.toString()}`,
    )
    // Filter out PRs — the issues endpoint includes them.
    return raw.filter((i) => !i.pull_request).map((i) => this.mapIssue(i))
  }

  async get(key: string): Promise<Issue> {
    const number = parseIssueNumber(key, this.owner, this.repoName)
    const raw = await this.rest.request<RawIssue>(`${this.base}/issues/${number}`)
    return this.mapIssue(raw)
  }

  // ── create / transition / comment ────────────────────────────────────

  async create(input: {
    summary: string
    body?: string
    labels?: string[]
    milestone?: string
  }): Promise<{ key: string }> {
    const body: Record<string, unknown> = { title: input.summary }
    if (input.body) body.body = input.body
    if (input.labels?.length) body.labels = input.labels
    if (input.milestone) body.milestone = await this.resolveMilestone(input.milestone)
    const raw = await this.rest.request<RawIssue>(`${this.base}/issues`, {
      method: 'POST',
      body,
    })
    return { key: `#${raw.number}` }
  }

  async transition(key: string, slot: LifecycleSlot): Promise<LifecycleResult> {
    const number = parseIssueNumber(key, this.owner, this.repoName)
    const issue = await this.rest.request<RawIssue>(`${this.base}/issues/${number}`)
    const currentStatusLabels = issue.labels
      .map((l) => l.name)
      .filter((n) => n.startsWith('status:'))

    if (slot === 'done') {
      if (issue.state === 'closed') {
        return { transitioned: false, status: 'closed', via: 'already closed' }
      }
      await this.removeStatusLabels(number, currentStatusLabels)
      await this.rest.request(`${this.base}/issues/${number}`, {
        method: 'PATCH',
        body: { state: 'closed', state_reason: 'completed' },
      })
      return { transitioned: true, status: 'closed', via: 'closed (completed)' }
    }

    // inProgress / inReview: ensure open + set the right label.
    const targetLabel = slot === 'inProgress' ? this.labels.inProgress : this.labels.inReview
    const alreadyOpen = issue.state === 'open'
    const alreadyLabeled = currentStatusLabels.includes(targetLabel)
    if (alreadyOpen && alreadyLabeled && currentStatusLabels.length === 1) {
      return {
        transitioned: false,
        status: `open + ${targetLabel}`,
        via: 'already there',
      }
    }

    if (!alreadyOpen) {
      await this.rest.request(`${this.base}/issues/${number}`, {
        method: 'PATCH',
        body: { state: 'open' },
      })
    }
    // Strip any other status:* labels but keep targetLabel if present.
    const toRemove = currentStatusLabels.filter((n) => n !== targetLabel)
    if (toRemove.length) await this.removeStatusLabels(number, toRemove)
    if (!alreadyLabeled) {
      await this.rest.request(`${this.base}/issues/${number}/labels`, {
        method: 'POST',
        body: { labels: [targetLabel] },
      })
    }
    return {
      transitioned: true,
      status: `open + ${targetLabel}`,
      via: `label set to ${targetLabel}`,
    }
  }

  async comment(key: string, body: string): Promise<void> {
    const number = parseIssueNumber(key, this.owner, this.repoName)
    await this.rest.request(`${this.base}/issues/${number}/comments`, {
      method: 'POST',
      body: { body },
    })
  }

  // ── doctor ───────────────────────────────────────────────────────────

  async doctor(): Promise<TrackerDoctorReport> {
    const me = await this.getMyself()
    const repo = await this.rest.request<RawRepo>(this.base)
    // List existing labels so doctor can lint whether the configured
    // status labels are actually defined. GitHub auto-creates labels
    // on first apply, so missing is just a warning, not an error.
    const allLabels = await this.rest.request<Array<{ name: string }>>(
      `${this.base}/labels?per_page=100`,
    )
    const labelNames = new Set(allLabels.map((l) => l.name))

    const statuses: TrackerDoctorReport['statuses'] = [
      { name: 'open (no status label)', category: 'open' },
      { name: `open + ${this.labels.inProgress}`, category: 'in-progress' },
      { name: `open + ${this.labels.inReview}`, category: 'in-review' },
      { name: 'closed', category: 'done' },
    ]

    const lifecycle: TrackerDoctorReport['lifecycle'] = [
      {
        slot: 'inProgress',
        value: this.labels.inProgress,
        resolved: labelNames.has(this.labels.inProgress),
        note: labelNames.has(this.labels.inProgress)
          ? `label exists in ${repo.full_name}`
          : '(label not defined yet — auto-created on first apply)',
      },
      {
        slot: 'inReview',
        value: this.labels.inReview,
        resolved: labelNames.has(this.labels.inReview),
        note: labelNames.has(this.labels.inReview)
          ? `label exists in ${repo.full_name}`
          : '(label not defined yet — auto-created on first apply)',
      },
      {
        slot: 'done',
        value: 'closed (state_reason=completed)',
        resolved: true,
        note: '(intrinsic — GitHub close-with-reason)',
      },
    ]

    return {
      authedAs: `${me.displayName} (${me.emailAddress ?? me.id})`,
      projectLabel: `Repo: ${repo.full_name}`,
      statuses,
      lifecycle,
    }
  }

  // ── internals ────────────────────────────────────────────────────────

  private async resolveMilestone(ref: string): Promise<number> {
    if (/^\d+$/.test(ref)) return parseInt(ref, 10)
    const milestones = await this.rest.request<RawMilestone[]>(
      `${this.base}/milestones?state=all&per_page=100`,
    )
    const match = milestones.find((m) => m.title.toLowerCase() === ref.toLowerCase())
    if (!match) {
      throw new Error(
        `Milestone "${ref}" not found in ${this.owner}/${this.repoName}. Use the numeric id or an exact title.`,
      )
    }
    return match.number
  }

  private async removeStatusLabels(number: number, labels: string[]): Promise<void> {
    // One DELETE per label — GitHub doesn't expose a bulk remove.
    // Sequential so a rate-limit hit on one doesn't fan out failures.
    for (const label of labels) {
      await this.rest.request(`${this.base}/issues/${number}/labels/${encodeURIComponent(label)}`, {
        method: 'DELETE',
      })
    }
  }

  private mapIssue(raw: RawIssue): Issue {
    const statusLabels = raw.labels.map((l) => l.name).filter((n) => n.startsWith('status:'))
    let category: StatusCategory = 'open'
    let statusName = raw.state === 'closed' ? 'closed' : 'open'
    if (raw.state === 'closed') {
      category = 'done'
    } else if (statusLabels.includes(this.labels.inProgress)) {
      category = 'in-progress'
      statusName = `open + ${this.labels.inProgress}`
    } else if (statusLabels.includes(this.labels.inReview)) {
      category = 'in-review'
      statusName = `open + ${this.labels.inReview}`
    }
    return {
      key: `#${raw.number}`,
      id: String(raw.id),
      summary: raw.title,
      ...(raw.body ? { body: raw.body } : {}),
      status: statusName,
      statusCategory: category,
      assignee: raw.assignee ? mapUser(raw.assignee) : null,
      updated: raw.updated_at,
      url: raw.html_url,
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

/**
 * Accept "#42", "42", or "owner/repo#42" and return the numeric id.
 * Cross-repo refs are allowed in input but the adapter is bound to one
 * repo — we error if the owner/repo doesn't match.
 */
function parseIssueNumber(key: string, owner: string, repoName: string): number {
  const trimmed = key.trim()
  // owner/repo#N form
  const crossMatch = trimmed.match(/^([^/]+)\/([^#]+)#(\d+)$/)
  if (crossMatch) {
    if (crossMatch[1] !== owner || crossMatch[2] !== repoName) {
      throw new Error(
        `Issue key "${key}" references ${crossMatch[1]}/${crossMatch[2]} but this adapter is bound to ${owner}/${repoName}.`,
      )
    }
    return parseInt(crossMatch[3]!, 10)
  }
  // #N or plain N
  const num = trimmed.replace(/^#/, '')
  if (!/^\d+$/.test(num)) {
    throw new Error(`Invalid GitHub issue key "${key}" — expected #N or N.`)
  }
  return parseInt(num, 10)
}

function mapUser(raw: RawUser): TrackerUser {
  return {
    id: raw.login,
    displayName: raw.name ?? raw.login,
    ...(raw.email ? { emailAddress: raw.email } : {}),
  }
}
