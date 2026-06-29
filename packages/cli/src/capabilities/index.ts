/**
 * Capability interfaces — the contracts that providers implement.
 *
 * Each capability has a stable key (`'source'`, `'ci'`, …) and a
 * cardinality (`'single'` = one provider; `'many'` = several active
 * at once). The cardinality is part of the type contract via
 * `CardinalityFor<K>` so config resolution + command code can branch
 * statically.
 *
 * See `.notes/tech-architecture.spec.md` for the design narrative
 * (status: proposed, issue: #74).
 */

export type CapabilityKey =
  | 'source'
  | 'ci'
  | 'secrets'
  | 'environments'
  | 'issues'
  | 'deployment'
  | 'storage'
  | 'auth'
  | 'vault'
  | 'dns'
  | 'tooling'
  | 'notifications'
  | 'analytics'
  | 'observability'

export type Cardinality = 'single' | 'many'

export const CARDINALITY = {
  source: 'single',
  ci: 'single',
  secrets: 'single',
  environments: 'single',
  issues: 'single',
  deployment: 'single',
  storage: 'single',
  auth: 'single',
  vault: 'single',
  dns: 'single',
  tooling: 'many',
  notifications: 'many',
  analytics: 'many',
  observability: 'many',
} as const satisfies Record<CapabilityKey, Cardinality>

/** Vault is required; everything else is optional in the config. */
export const REQUIRED_CAPABILITIES: readonly CapabilityKey[] = ['vault'] as const

// ───────────────────────────────────────────────────────────────────────
// Common shapes
// ───────────────────────────────────────────────────────────────────────

export interface ProviderIdentity {
  readonly key: CapabilityKey
  readonly providerName: string
}

/**
 * Surfaced from every capability call that hits a vendor API. Wraps
 * the underlying error with `status` (HTTP) and `details` so
 * orchestrators (`holocron setup`, `doctor`) can soft-skip rather
 * than abort.
 */
export class ProviderApiError extends Error {
  override name = 'ProviderApiError'
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

// ───────────────────────────────────────────────────────────────────────
// source — repos, branches, PRs, rulesets, settings, workflow files
// ───────────────────────────────────────────────────────────────────────

export interface Ruleset {
  id: number
  name: string
  enforcement: 'active' | 'evaluate' | 'disabled'
  target?: string
}

export interface RepoSettings {
  allow_squash_merge?: boolean
  allow_merge_commit?: boolean
  allow_rebase_merge?: boolean
  allow_auto_merge?: boolean
  delete_branch_on_merge?: boolean
  default_branch?: string
  has_issues?: boolean
  has_discussions?: boolean
}

export interface RepoRef {
  owner: string
  name: string
  defaultBranch: string
}

export interface Source extends ProviderIdentity {
  readonly key: 'source'

  /** Auth sanity-check. Throws ProviderApiError on auth failure. */
  whoami(): Promise<{ login: string }>

  getRepo(): Promise<RepoRef>

  // Rulesets / branch protection
  listRulesets(): Promise<Ruleset[]>
  createRuleset(payload: Record<string, unknown>): Promise<Ruleset>
  updateRuleset(id: number, payload: Record<string, unknown>): Promise<Ruleset>

  // Repo settings
  updateRepoSettings(settings: RepoSettings): Promise<void>

  // Security toggles (idempotent; flip-or-noop)
  enableVulnerabilityAlerts(): Promise<void>
  enableAutomatedSecurityFixes(): Promise<void>
  enableSecretScanning(): Promise<void>
  enablePrivateVulnerabilityReporting(): Promise<void>

  // Workflow files — local YAML files in `.github/workflows/` (or
  // equivalent). These are conceptually repo content; providers may
  // throw `NotImplementedError` if the underlying VCS has no notion
  // of declarative CI files.
  listWorkflowFiles(): Promise<string[]>
  readWorkflowFile(name: string): Promise<string | null>
  writeWorkflowFile(name: string, contents: string): Promise<void>
  removeWorkflowFile(name: string): Promise<void>
}

// ───────────────────────────────────────────────────────────────────────
// ci — workflow runs (history + status only)
// ───────────────────────────────────────────────────────────────────────

export type CiRunStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failure'
  | 'success'
  | 'skipped'

export interface CiRun {
  id: string | number
  workflowName: string
  branch: string
  sha: string
  status: CiRunStatus
  url: string
  startedAt: string
  completedAt?: string
}

export interface CiRunFilter {
  branch?: string
  status?: CiRunStatus
  limit?: number
}

export interface Ci extends ProviderIdentity {
  readonly key: 'ci'
  listRuns(filter?: CiRunFilter): Promise<CiRun[]>
  getRun(id: string | number): Promise<CiRun>
}

// ───────────────────────────────────────────────────────────────────────
// secrets — CI/platform secrets sync destination (multi-scope)
// ───────────────────────────────────────────────────────────────────────

export type SecretScope =
  | { kind: 'repo' }
  | { kind: 'environment'; name: string }
  | { kind: 'organization'; name: string }

export interface Secrets extends ProviderIdentity {
  readonly key: 'secrets'

  /** List secret NAMES (not values) at the given scope. */
  listSecrets(scope: SecretScope): Promise<string[]>

  /** Idempotent upsert. Adapter handles encryption. */
  setSecret(scope: SecretScope, name: string, value: string): Promise<void>

  deleteSecret(scope: SecretScope, name: string): Promise<void>
}

// ───────────────────────────────────────────────────────────────────────
// environments — named deployment environments
// ───────────────────────────────────────────────────────────────────────

export interface EnvironmentReviewer {
  type: 'User' | 'Team'
  /** Numeric id — GitHub's reviewer API silently ignores login strings. */
  id: number
}

export interface Environment {
  name: string
  reviewers?: EnvironmentReviewer[]
  waitTimer?: number
  preventSelfReview?: boolean
}

export interface Environments extends ProviderIdentity {
  readonly key: 'environments'
  listEnvironments(): Promise<Environment[]>
  upsertEnvironment(env: Environment): Promise<void>
  deleteEnvironment(name: string): Promise<void>
}

// ───────────────────────────────────────────────────────────────────────
// issues — tracker
// ───────────────────────────────────────────────────────────────────────

export type LifecycleSlot = 'inProgress' | 'inReview' | 'done'

export type StatusCategory = 'open' | 'in-progress' | 'in-review' | 'done' | 'other'

export interface TrackerUser {
  id: string
  displayName: string
  emailAddress?: string
}

export interface Issue {
  /** Human-readable key — "#42" for GitHub, "RANDO-42" for Jira. */
  key: string
  /** Internal opaque id. */
  id: string
  summary: string
  body?: string
  status: string
  statusCategory: StatusCategory
  assignee: TrackerUser | null
  updated: string
  url?: string
}

export interface IssueSearchFilter {
  /** Restrict to issues assigned to a specific id, or 'currentUser'. */
  assignee?: string | 'currentUser'
  /** Exclude issues in the `done` category. */
  openOnly?: boolean
  /** Max number of issues to return. Adapters apply a sensible default. */
  limit?: number
}

export interface LifecycleResult {
  /** False when no API write happened (already at target state). */
  transitioned: boolean
  /** Status name the issue is in after this call. */
  status: string
  /** Adapter-specific note (e.g., "label set" / "closed (completed)"). */
  via?: string
}

export interface TrackerDoctorReport {
  /** "Authenticated as ..." subject for the spinner. */
  authedAs: string
  /** Free-form "Project: RANDO" / "Repo: rando-id/rando" identifier. */
  projectLabel: string
  /** Status values the adapter exposes. */
  statuses: Array<{ name: string; category: StatusCategory }>
  /**
   * Per-lifecycle-slot readiness check. `resolved` indicates whether
   * the configured value actually maps to something the tracker
   * recognizes; the `note` is the rendered explanation.
   */
  lifecycle: Array<{
    slot: LifecycleSlot
    value: string | null
    resolved: boolean
    note: string
  }>
}

export interface Issues extends ProviderIdentity {
  readonly key: 'issues'

  /** Currently-authenticated user. */
  getMyself(): Promise<TrackerUser>

  search(filter: IssueSearchFilter): Promise<Issue[]>
  get(key: string): Promise<Issue>

  create(input: {
    summary: string
    body?: string
    labels?: string[]
    /** Numeric id or exact title (case-insensitive). */
    milestone?: string
  }): Promise<{ key: string }>

  /** Idempotent — `transitioned: false` if the issue is already at the target. */
  transition(key: string, slot: LifecycleSlot): Promise<LifecycleResult>

  comment(key: string, body: string): Promise<void>

  doctor(): Promise<TrackerDoctorReport>
}

// ───────────────────────────────────────────────────────────────────────
// deployment — preview/prod deploy targets
// ───────────────────────────────────────────────────────────────────────

export type DeploymentTarget = 'development' | 'preview' | 'production'

export interface DeploymentProject {
  id: string
  name: string
  framework?: string
}

export interface DeploymentRecord {
  id: string
  url: string
  target: DeploymentTarget
  status: 'queued' | 'building' | 'ready' | 'error' | 'cancelled'
  createdAt: string
}

export interface Deployment extends ProviderIdentity {
  readonly key: 'deployment'

  listProjects(): Promise<DeploymentProject[]>
  ensureProject(input: { name: string; framework?: string }): Promise<DeploymentProject>

  // Env vars on the deploy platform (Vercel-style: per-target).
  listEnvVars(projectId: string, target: DeploymentTarget): Promise<string[]>
  setEnvVar(projectId: string, target: DeploymentTarget, name: string, value: string): Promise<void>

  listDeployments(projectId: string): Promise<DeploymentRecord[]>
  promote(deploymentId: string, target: 'production'): Promise<DeploymentRecord>
}

// ───────────────────────────────────────────────────────────────────────
// storage — DB / object / file store
// ───────────────────────────────────────────────────────────────────────

export interface StorageBranch {
  id: string
  name: string
  parent?: string
  createdAt: string
}

export interface Storage extends ProviderIdentity {
  readonly key: 'storage'

  /** Get a connection string scoped to a deploy target. */
  getConnectionString(target: DeploymentTarget): Promise<string>

  // Branch-per-PR providers (Neon, PlanetScale) implement these; the
  // rest can throw NotImplementedError.
  listBranches?(): Promise<StorageBranch[]>
  createBranch?(name: string, parent?: string): Promise<StorageBranch>
  destroyBranch?(name: string): Promise<void>
}

// ───────────────────────────────────────────────────────────────────────
// auth — identity provider
// ───────────────────────────────────────────────────────────────────────

export interface AuthDescription {
  provider: string
  /** Env-var names the app needs at runtime (CLERK_PUBLISHABLE_KEY, etc.). */
  envKeys: string[]
}

export interface Auth extends ProviderIdentity {
  readonly key: 'auth'
  describe(): Promise<AuthDescription>

  /** Optional: wire a webhook from the auth provider into the repo. */
  syncWebhook?(input: { repo: string; secretRef: string }): Promise<void>
}

// ───────────────────────────────────────────────────────────────────────
// vault — REQUIRED source-of-truth for secrets
// ───────────────────────────────────────────────────────────────────────

export interface Vault extends ProviderIdentity {
  readonly key: 'vault'

  /**
   * Read a secret by reference. The reference format is
   * provider-specific (1P: "op://Vault/Item/field"; HashiCorp Vault:
   * "kv/path#field"; etc.). Adapters validate the reference shape.
   */
  read(reference: string): Promise<string>

  /** Write or update a secret. */
  write(reference: string, value: string): Promise<void>

  /** List secret keys available to the project. */
  list(): Promise<string[]>

  /**
   * Optional environment notion within the vault (e.g., 1P
   * Environments). Adapters without environments return [].
   */
  environments?(): Promise<string[]>
}

// ───────────────────────────────────────────────────────────────────────
// dns — DNS record management
// ───────────────────────────────────────────────────────────────────────

export type DnsRecordType =
  | 'A'
  | 'AAAA'
  | 'CNAME'
  | 'TXT'
  | 'MX'
  | 'NS'
  | 'SRV'
  | 'CAA'

export interface DnsRecord {
  id?: string
  type: DnsRecordType
  name: string
  content: string
  ttl?: number
  priority?: number
}

export interface Dns extends ProviderIdentity {
  readonly key: 'dns'
  listRecords(domain: string): Promise<DnsRecord[]>
  upsertRecord(domain: string, record: DnsRecord): Promise<DnsRecord>
  deleteRecord(domain: string, id: string): Promise<void>
}

// ───────────────────────────────────────────────────────────────────────
// Multi-provider capabilities — many can be active at once
// ───────────────────────────────────────────────────────────────────────

export interface ToolingDoctorReport {
  ok: boolean
  message: string
}

export interface Tooling extends ProviderIdentity {
  readonly key: 'tooling'

  /** Sync the tool's authoritative state from the repo. */
  sync(): Promise<void>

  doctor(): Promise<ToolingDoctorReport>
}

export interface Notifications extends ProviderIdentity {
  readonly key: 'notifications'

  /**
   * Send a message. `channel` is provider-specific (Slack channel id,
   * Discord webhook url-name, etc.); adapters resolve from config.
   */
  send(channel: string, message: string): Promise<void>
}

export interface Analytics extends ProviderIdentity {
  readonly key: 'analytics'
  describe(): Promise<{ provider: string; dsnEnvKey: string }>
}

export interface Observability extends ProviderIdentity {
  readonly key: 'observability'
  describe(): Promise<{ provider: string; dsnEnvKey: string }>
}

// ───────────────────────────────────────────────────────────────────────
// Capability map (key → implementation type) + cardinality helpers
// ───────────────────────────────────────────────────────────────────────

export interface CapabilityImpls {
  source: Source
  ci: Ci
  secrets: Secrets
  environments: Environments
  issues: Issues
  deployment: Deployment
  storage: Storage
  auth: Auth
  vault: Vault
  dns: Dns
  tooling: Tooling
  notifications: Notifications
  analytics: Analytics
  observability: Observability
}

export type CardinalityFor<K extends CapabilityKey> = (typeof CARDINALITY)[K]

/** Resolved runtime shape: single → one impl; many → array. */
export type ResolvedCapability<K extends CapabilityKey> = CardinalityFor<K> extends 'many'
  ? CapabilityImpls[K][]
  : CapabilityImpls[K]

export function isMulti<K extends CapabilityKey>(key: K): CardinalityFor<K> extends 'many' ? true : false {
  return (CARDINALITY[key] === 'many') as CardinalityFor<K> extends 'many' ? true : false
}
