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
	| "source"
	| "ci"
	| "secrets"
	| "environments"
	| "issues"
	| "deployment"
	| "storage"
	| "auth"
	| "vault"
	| "dns"
	| "tooling"
	| "notifications"
	| "analytics"
	| "observability"
	| "wiki";

export type Cardinality = "single" | "many";

export const CARDINALITY = {
	source: "single",
	ci: "single",
	secrets: "single",
	environments: "single",
	issues: "single",
	deployment: "single",
	storage: "single",
	auth: "single",
	vault: "single",
	dns: "single",
	tooling: "many",
	notifications: "many",
	analytics: "many",
	observability: "many",
	wiki: "single",
} as const satisfies Record<CapabilityKey, Cardinality>;

/**
 * No capabilities are strictly required — repos without secrets (e.g. org
 * community health repos) legitimately omit vault. Plugins validate their
 * own requirements at call time.
 */
export const REQUIRED_CAPABILITIES: readonly CapabilityKey[] = [] as const;

// ───────────────────────────────────────────────────────────────────────
// Common shapes
// ───────────────────────────────────────────────────────────────────────

export interface ProviderIdentity {
	readonly key: CapabilityKey;
	readonly providerName: string;
}

export { ProviderApiError } from "@theholocron/http-client";

// ───────────────────────────────────────────────────────────────────────
// source — repos, branches, PRs, rulesets, settings, workflow files
// ───────────────────────────────────────────────────────────────────────

export interface Ruleset {
	id: number;
	name: string;
	enforcement: "active" | "evaluate" | "disabled";
	target?: string;
}

export interface RepoSettings {
	allow_squash_merge?: boolean;
	allow_merge_commit?: boolean;
	allow_rebase_merge?: boolean;
	allow_auto_merge?: boolean;
	/** Always suggest updating PR branches when the base branch has new commits. */
	allow_update_branch?: boolean;
	delete_branch_on_merge?: boolean;
	default_branch?: string;
	has_issues?: boolean;
	has_discussions?: boolean;
	has_projects?: boolean;
	has_wiki?: boolean;
}

export interface RepoRef {
	owner: string;
	name: string;
	defaultBranch: string;
}

export interface LabelDef {
	readonly name: string;
	readonly color: string;
	readonly description: string;
}

export type TeamPermission = "pull" | "triage" | "push" | "maintain" | "admin";

/** Shorthand `"slug"` defaults to `push` permission. */
export type TeamEntry = string | { slug: string; permission: TeamPermission };

export interface Source extends ProviderIdentity {
	readonly key: "source";

	/** Auth sanity-check. Throws ProviderApiError on auth failure. */
	whoami(): Promise<{ login: string }>;

	getRepo(): Promise<RepoRef>;

	// Rulesets / branch protection
	listRulesets(): Promise<Ruleset[]>;
	createRuleset(payload: Record<string, unknown>): Promise<Ruleset>;
	updateRuleset(id: number, payload: Record<string, unknown>): Promise<Ruleset>;

	// Repo settings
	updateRepoSettings(settings: RepoSettings): Promise<void>;

	/**
	 * Classic branch protection — fallback for private repos on free plans
	 * where the Rulesets API (requires Team+) returns 403.
	 */
	protectBranch(branch: string, payload: Record<string, unknown>): Promise<void>;

	// Security toggles (idempotent; flip-or-noop)
	enableVulnerabilityAlerts(): Promise<void>;
	enableAutomatedSecurityFixes(): Promise<void>;
	enableSecretScanning(): Promise<void>;
	enablePrivateVulnerabilityReporting(): Promise<void>;
	/**
	 * Enables the dependency graph and automatic dependency snapshot
	 * submission. Also enables secret-scanning validity checks and
	 * non-provider pattern detection — these require GitHub Advanced
	 * Security at the org level; the call is accepted but may be a no-op
	 * until that is configured.
	 */
	enableDependencyGraph(): Promise<void>;

	/**
	 * Enables CodeQL default setup with the extended query suite and
	 * `threat_model: all` (scans both remote and local exploit paths).
	 * Triggers a new analysis run; returns the run id.
	 */
	enableCodeScanning(): Promise<string>;

	/**
	 * Disables CodeQL default setup. Required when the repo uses an advanced
	 * CodeQL workflow instead — GitHub rejects SARIF from advanced workflows
	 * while default setup is active.
	 */
	disableDefaultCodeScanning(): Promise<void>;

	// Workflow files — local YAML files in `.github/workflows/` (or
	// equivalent). These are conceptually repo content; providers may
	// throw `NotImplementedError` if the underlying VCS has no notion
	// of declarative CI files.
	listWorkflowFiles(): Promise<string[]>;
	readWorkflowFile(name: string): Promise<string | null>;
	writeWorkflowFile(name: string, contents: string): Promise<void>;
	removeWorkflowFile(name: string): Promise<void>;

	/**
	 * Write an arbitrary file relative to the repo root. Used for
	 * provisioning config files that live outside `.github/workflows/`
	 * (e.g. `.github/dependabot.yml`).
	 */
	writeRepoFile(path: string, contents: string): Promise<void>;

	/**
	 * Idempotently sync repo labels to a canonical set. Creates missing
	 * labels, patches color/description drift, deletes stale labels.
	 * Optional — providers that have no label concept omit this.
	 */
	syncLabels?(canonical: ReadonlyArray<LabelDef>, stale: ReadonlyArray<string>): Promise<string>;

	/**
	 * Set org-level custom property values on the repo.
	 * Optional — providers that don't support custom properties omit this.
	 */
	syncProperties?(values: Record<string, string>): Promise<string>;

	/**
	 * Replace the repo's topic set with the supplied list.
	 * Optional — providers that don't support topics omit this.
	 */
	syncTopics?(topics: string[]): Promise<string>;

	/**
	 * Sync GitHub team repository access. String shorthand defaults to `push`.
	 * Optional — providers without a team concept omit this.
	 */
	syncTeams?(teams: TeamEntry[]): Promise<string>;

	/**
	 * Set the repository description.
	 * Optional — providers that don't support setting descriptions omit this.
	 */
	syncDescription?(description: string): Promise<string>;

	/**
	 * Set the repository homepage URL (the "Website" field on the repo landing page).
	 * Optional — providers that don't support setting a homepage omit this.
	 */
	syncHomepage?(homepage: string): Promise<string>;

	/**
	 * Fetch a pull request by number. The `repo` override lets callers look up
	 * a PR in a different repo than the one the plugin is scoped to — useful
	 * when the cleanup command targets another repo's PR (e.g. docs PR from
	 * the holocron repo context).
	 * Optional — providers without a PR concept omit this.
	 */
	getPullRequest?(number: number, repo?: string): Promise<PullRequest>;

	/**
	 * Enable or update GitHub Pages for the repository.
	 * Idempotent: POST to create, PUT to update existing settings.
	 * Requires HOLOCRON_DEPLOY_TOKEN (pages:write + repo scope) — passed
	 * explicitly because it is a different PAT from the main admin token.
	 * Optional — providers without a Pages concept omit this.
	 */
	configurePages?(config: PagesConfig, token: string): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// Pages
// ───────────────────────────────────────────────────────────────────────

export interface PagesConfig {
	/** GitHub Pages build source. */
	build: "workflow" | "branch";
	/**
	 * Custom domain / CNAME (e.g. "docs.theholocron.dev").
	 * When set and `homepage` is absent in holocron.config, setup derives
	 * homepage as `https://{domain}/`.
	 */
	domain?: string;
	/** Enforce HTTPS. Only effective once the custom domain is DNS-verified. */
	https?: boolean;
}

export interface PullRequest {
	number: number;
	title: string;
	/** "open" | "closed" — GitHub marks merged PRs as "closed". */
	state: "open" | "closed";
	/** True when the PR was merged (as opposed to closed without merging). */
	merged: boolean;
	/** The head branch name (e.g. "fix/my-change"). */
	branch: string;
	url: string;
}

// ───────────────────────────────────────────────────────────────────────
// ci — workflow runs (history + status only)
// ───────────────────────────────────────────────────────────────────────

export type CiRunStatus = "queued" | "in_progress" | "completed" | "cancelled" | "failure" | "success" | "skipped";

export interface CiRun {
	id: string | number;
	workflowName: string;
	branch: string;
	sha: string;
	status: CiRunStatus;
	url: string;
	startedAt: string;
	completedAt?: string;
}

export interface CiRunFilter {
	branch?: string;
	status?: CiRunStatus;
	limit?: number;
}

export interface Ci extends ProviderIdentity {
	readonly key: "ci";
	listRuns(filter?: CiRunFilter): Promise<CiRun[]>;
	getRun(id: string | number): Promise<CiRun>;
}

// ───────────────────────────────────────────────────────────────────────
// secrets — CI/platform secrets sync destination (multi-scope)
// ───────────────────────────────────────────────────────────────────────

export type SecretScope =
	| { kind: "repo" }
	| { kind: "environment"; name: string }
	| { kind: "organization"; name: string };

export interface Secrets extends ProviderIdentity {
	readonly key: "secrets";

	/** List secret NAMES (not values) at the given scope. */
	listSecrets(scope: SecretScope): Promise<string[]>;

	/** Idempotent upsert. Adapter handles encryption. */
	setSecret(scope: SecretScope, name: string, value: string): Promise<void>;

	deleteSecret(scope: SecretScope, name: string): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// environments — named deployment environments
// ───────────────────────────────────────────────────────────────────────

export interface EnvironmentReviewer {
	type: "User" | "Team";
	/** Numeric id — GitHub's reviewer API silently ignores login strings. */
	id: number;
}

export interface Environment {
	name: string;
	reviewers?: EnvironmentReviewer[];
	waitTimer?: number;
	preventSelfReview?: boolean;
}

export interface Environments extends ProviderIdentity {
	readonly key: "environments";
	listEnvironments(): Promise<Environment[]>;
	upsertEnvironment(env: Environment): Promise<void>;
	deleteEnvironment(name: string): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// issues — tracker
// ───────────────────────────────────────────────────────────────────────

export type LifecycleSlot = "inProgress" | "inReview" | "done";

export type StatusCategory = "open" | "in-progress" | "in-review" | "done" | "other";

export interface TrackerUser {
	id: string;
	displayName: string;
	emailAddress?: string;
}

export interface Issue {
	/** Human-readable key — "#42" for GitHub, "RANDO-42" for Jira. */
	key: string;
	/** Internal opaque id. */
	id: string;
	summary: string;
	body?: string;
	status: string;
	statusCategory: StatusCategory;
	assignee: TrackerUser | null;
	updated: string;
	url?: string;
}

export interface IssueSearchFilter {
	/** Restrict to issues assigned to a specific id, or 'currentUser'. */
	assignee?: string | "currentUser";
	/** Exclude issues in the `done` category. */
	openOnly?: boolean;
	/** Max number of issues to return. Adapters apply a sensible default. */
	limit?: number;
}

export interface LifecycleResult {
	/** False when no API write happened (already at target state). */
	transitioned: boolean;
	/** Status name the issue is in after this call. */
	status: string;
	/** Adapter-specific note (e.g., "label set" / "closed (completed)"). */
	via?: string;
}

export interface TrackerDoctorReport {
	/** "Authenticated as ..." subject for the spinner. */
	authedAs: string;
	/** Free-form "Project: RANDO" / "Repo: rando-id/rando" identifier. */
	projectLabel: string;
	/** Status values the adapter exposes. */
	statuses: Array<{ name: string; category: StatusCategory }>;
	/**
	 * Per-lifecycle-slot readiness check. `resolved` indicates whether
	 * the configured value actually maps to something the tracker
	 * recognizes; the `note` is the rendered explanation.
	 */
	lifecycle: Array<{
		slot: LifecycleSlot;
		value: string | null;
		resolved: boolean;
		note: string;
	}>;
}

export interface Issues extends ProviderIdentity {
	readonly key: "issues";

	/** Currently-authenticated user. */
	getMyself(): Promise<TrackerUser>;

	search(filter: IssueSearchFilter): Promise<Issue[]>;
	get(key: string): Promise<Issue>;

	create(input: {
		summary: string;
		body?: string;
		labels?: string[];
		/** Numeric id or exact title (case-insensitive). */
		milestone?: string;
	}): Promise<{ key: string }>;

	/** Idempotent — `transitioned: false` if the issue is already at the target. */
	transition(key: string, slot: LifecycleSlot): Promise<LifecycleResult>;

	comment(key: string, body: string): Promise<void>;

	doctor(): Promise<TrackerDoctorReport>;
}

// ───────────────────────────────────────────────────────────────────────
// deployment — preview/prod deploy targets
// ───────────────────────────────────────────────────────────────────────

/** Env-var scope on the deploy platform. */
export type DeploymentTarget = "development" | "preview" | "production";

/**
 * Named deployment trigger target — `undefined` means a branch
 * preview (no named environment).
 */
export type DeploymentTrigger = "production" | "staging";

export interface DeploymentProject {
	id: string;
	name: string;
	framework?: string;
	/** True when the project is linked to a Git provider. */
	gitLinked?: boolean;
	rootDirectory?: string | null;
}

export interface DeploymentProjectSettings {
	previewDeploymentsDisabled?: boolean;
	/** Vercel-specific: whether the GitHub integration creates deployments
	 * for every push (false → only on-demand triggers). */
	gitProviderCreateDeployments?: boolean;
}

export interface DeploymentRecord {
	id: string;
	url: string;
	/** Branch this deployment was made from (null if not git-sourced). */
	branch: string | null;
	/** Named environment if one was targeted; undefined for branch previews. */
	target?: DeploymentTrigger;
	status: "queued" | "building" | "ready" | "error" | "cancelled";
	createdAt?: string;
}

export interface Deployment extends ProviderIdentity {
	readonly key: "deployment";

	listProjects(): Promise<DeploymentProject[]>;
	/** Create if missing, otherwise return existing. Idempotent. */
	ensureProject(input: {
		name: string;
		framework?: string;
		/** "owner/repo" — passed when linking to a Git provider. */
		repo?: string;
		rootDirectory?: string;
	}): Promise<DeploymentProject>;

	updateProjectSettings(projectId: string, settings: DeploymentProjectSettings): Promise<DeploymentProject>;

	// Env vars on the deploy platform (Vercel-style: per-target).
	listEnvVars(projectId: string, target: DeploymentTarget): Promise<string[]>;
	setEnvVar(projectId: string, target: DeploymentTarget, name: string, value: string): Promise<void>;

	/**
	 * Kick off a deployment of the given branch. Omit `target` for a
	 * branch preview; pass `'production'` / `'staging'` to deploy into
	 * a named environment.
	 */
	triggerDeployment(input: {
		projectId: string;
		branch: string;
		target?: DeploymentTrigger;
	}): Promise<DeploymentRecord>;

	getDeployment(deploymentId: string): Promise<DeploymentRecord>;

	/**
	 * List preview deployments for a specific branch alias (e.g. "repo-pr-42").
	 * Optional — providers that don't support listing by branch omit this.
	 */
	listPreviewDeployments?(projectId: string, branch: string): Promise<DeploymentRecord[]>;

	/**
	 * Delete specific preview deployments by id. Returns the count deleted.
	 * Optional — providers that don't support deletion omit this.
	 */
	deletePreviewDeployments?(projectId: string, deploymentIds: string[]): Promise<number>;

	/**
	 * Add a custom domain (or wildcard) to the project. Idempotent — no-op
	 * when the domain is already present. Optional: providers without a custom
	 * domain API omit this (e.g. Vercel manages domains separately).
	 */
	ensureCustomDomain?(projectId: string, hostname: string): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// storage — DB / object / file store
// ───────────────────────────────────────────────────────────────────────

export interface StorageBranch {
	id: string;
	name: string;
	/** Parent branch id; null for the root/main branch. */
	parentId: string | null;
	createdAt: string;
}

export interface ConnectionStringOptions {
	/** Use the pooled (PgBouncer) URL when available. Defaults to false. */
	pooled?: boolean;
}

export interface Storage extends ProviderIdentity {
	readonly key: "storage";

	/**
	 * Connection string for the given scope. Scope is provider-specific:
	 *
	 *   - branch-based providers (Neon, PlanetScale): scope = branch
	 *     name or id
	 *   - flat providers (single Postgres instance): scope is ignored
	 *
	 * Callers (or the orchestrator) decide how a deploy target maps to
	 * a scope; the storage plugin doesn't own that mapping.
	 */
	getConnectionString(scope: string, options?: ConnectionStringOptions): Promise<string>;

	// Branch operations (optional — flat providers can omit).
	listBranches?(): Promise<StorageBranch[]>;
	createBranch?(input: { name: string; from?: string }): Promise<StorageBranch>;
	destroyBranch?(branch: string): Promise<void>;
	/** Restore one branch to match another (e.g., reset preview → main). */
	resetBranch?(input: { branch: string; from: string }): Promise<void>;

	/**
	 * Provider-specific feature toggle. For Postgres providers this is
	 * `CREATE EXTENSION IF NOT EXISTS ...` per branch.
	 */
	enableExtension?(input: { branch: string; extension: string }): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// auth — identity provider
// ───────────────────────────────────────────────────────────────────────

export interface AuthDescription {
	provider: string;
	/** Env-var names the app needs at runtime (CLERK_PUBLISHABLE_KEY, etc.). */
	envKeys: string[];
}

export interface AuthIdentity {
	provider: string;
	/** Provider-specific health signal (user count, role, account name, etc.). */
	details?: Record<string, unknown>;
}

export interface AuthUser {
	id: string;
	email: string;
}

export interface CreateAuthUserInput {
	email: string;
	password: string;
	firstName?: string;
	lastName?: string;
}

export interface WebhookDashboardInfo {
	url: string;
}

export interface Auth extends ProviderIdentity {
	readonly key: "auth";

	/** Env-var keys the runtime app needs. */
	describe(): Promise<AuthDescription>;

	/** Reachability probe — proves the configured key works. */
	whoami(): Promise<AuthIdentity>;

	// Optional capabilities — providers implement what they support.

	/** Idempotent webhook backend provisioning (Clerk: Svix app). */
	ensureWebhookApp?(): Promise<{ alreadyExists: boolean }>;

	/** Deep-link to the provider's webhook config dashboard. */
	getWebhookDashboardUrl?(): Promise<WebhookDashboardInfo>;

	/** Seed a user (test fixtures, admin bootstrap). */
	createUser?(input: CreateAuthUserInput): Promise<AuthUser>;

	/** Wire the auth provider's webhook into the project's repo. */
	syncWebhook?(input: { repo: string; secretRef: string }): Promise<void>;
}

// ── Normalized webhook events (cross-provider sync) ──────────────────
//
// Plugins implementing `auth` may also expose a `parseWebhook` utility
// (NOT a capability method — exported alongside the plugin's
// createPlugin) that translates the vendor's webhook payload into one
// of these normalized event shapes. Your app's webhook handler then
// reads the normalized event and is vendor-agnostic:
//
//   import { parseWebhook } from '@theholocron/holocron-plugin-clerk'
//   import type { AuthEvent } from '@theholocron/cli'
//
//   app.post('/webhooks/clerk', async (req) => {
//     const event: AuthEvent = await parseWebhook({
//       body: req.body,
//       headers: req.headers,
//       signingSecret: process.env.CLERK_WEBHOOK_SECRET!,
//     })
//     await db.users.upsert(event.user)
//   })
//
// Swap clerk for another auth plugin → change one import line; the
// handler logic stays the same.

export type AuthEventType = "user.created" | "user.updated" | "user.deleted";

export interface NormalizedAuthUser {
	id: string;
	email: string;
	firstName?: string | null;
	lastName?: string | null;
	/** Provider-native fields preserved verbatim for consumers that need them. */
	raw?: Record<string, unknown>;
}

export interface AuthEvent {
	type: AuthEventType;
	user: NormalizedAuthUser;
	/** ISO timestamp of when the event occurred. */
	occurredAt: string;
}

export interface ParseWebhookInput {
	/** Raw request body (string or Buffer). */
	body: string | Buffer;
	/** Incoming HTTP headers — needed for signature verification. */
	headers: Record<string, string | string[] | undefined>;
	/** The signing secret the auth provider issued for this webhook endpoint. */
	signingSecret: string;
}

export class WebhookVerificationError extends Error {
	override name = "WebhookVerificationError";
}

// ───────────────────────────────────────────────────────────────────────
// vault — REQUIRED source-of-truth for secrets
// ───────────────────────────────────────────────────────────────────────

export interface EnsureResult {
	/** True when the resource already existed (idempotent no-op). */
	alreadyExists: boolean;
}

export interface Vault extends ProviderIdentity {
	readonly key: "vault";

	/**
	 * Read a secret by reference. The reference format is
	 * provider-specific (1P: "op://Vault/Item/field"; HashiCorp Vault:
	 * "kv/path#field"; etc.). Adapters validate the reference shape.
	 */
	read(reference: string): Promise<string>;

	/** Write or update a secret. */
	write(reference: string, value: string): Promise<void>;

	/** List secret keys available to the project. */
	list(): Promise<string[]>;

	/**
	 * Optional environment notion within the vault (e.g., 1P
	 * Environments — named KEY=VALUE bundles). Adapters without
	 * environments return [].
	 */
	environments?(): Promise<string[]>;

	/**
	 * Optional bulk read of an environment's KEY=VALUE pairs. Powers
	 * the `holocron secrets sync` flow where the orchestrator pulls a
	 * whole environment from the vault then fans the values out to
	 * destinations (CI secrets, deployment env vars, local .env).
	 */
	readEnvironment?(environmentId: string): Promise<Record<string, string>>;

	/**
	 * Optional — create the top-level project container in the vault
	 * if it does not exist. Idempotent: `alreadyExists: true` when the
	 * project was already there. Providers whose data model has no
	 * project notion (or that gate this behind a paid tier) omit this.
	 */
	ensureProject?(name: string): Promise<EnsureResult>;

	/**
	 * Optional — create a named environment/config inside a project
	 * (e.g., Doppler config `dev` / `stg` / `prd`). Idempotent.
	 * Providers whose data model has a single flat namespace omit this.
	 */
	ensureEnvironment?(project: string, name: string): Promise<EnsureResult>;
}

// ───────────────────────────────────────────────────────────────────────
// dns — DNS record management
// ───────────────────────────────────────────────────────────────────────

export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS" | "SRV" | "CAA";

export interface DnsRecord {
	id?: string;
	type: DnsRecordType;
	name: string;
	content: string;
	ttl?: number;
	priority?: number;
}

export interface Dns extends ProviderIdentity {
	readonly key: "dns";
	listRecords(domain: string): Promise<DnsRecord[]>;
	upsertRecord(domain: string, record: DnsRecord): Promise<DnsRecord>;
	deleteRecord(domain: string, id: string): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// Multi-provider capabilities — many can be active at once
// ───────────────────────────────────────────────────────────────────────

export interface ToolingDoctorReport {
	ok: boolean;
	message: string;
}

export interface Tooling extends ProviderIdentity {
	readonly key: "tooling";

	/** Sync the tool's authoritative state from the repo. */
	sync(): Promise<void>;

	doctor(): Promise<ToolingDoctorReport>;
}

export interface Notifications extends ProviderIdentity {
	readonly key: "notifications";

	/**
	 * Send a message. `channel` is provider-specific (Slack channel id,
	 * Discord webhook url-name, etc.); adapters resolve from config.
	 */
	send(channel: string, message: string): Promise<void>;
}

export interface Analytics extends ProviderIdentity {
	readonly key: "analytics";
	/** Returns the env var names the app reads at runtime for this provider. */
	describe(): Promise<{ provider: string; envKeys: string[] }>;
	whoami?(): Promise<{ org: string }>;
	ensureProject?(name: string): Promise<{ token: string; alreadyExists: boolean }>;
}

export interface Observability extends ProviderIdentity {
	readonly key: "observability";
	/** Returns the env var names the app reads at runtime for this provider. */
	describe(): Promise<{ provider: string; envKeys: string[] }>;
	whoami?(): Promise<{ org: string }>;
	ensureProject?(input: { name: string; platform?: string }): Promise<{ dsn: string; alreadyExists: boolean }>;
}

// ───────────────────────────────────────────────────────────────────────
// wiki — engineering knowledge publishing platform
// ───────────────────────────────────────────────────────────────────────

export interface WikiProvisionOpts {
	/** Project display name used in the wiki title (e.g. "Holocron"). */
	name?: string;
}

/**
 * Engineering wiki provider.
 *
 * A swappable provider for publishing the `docs/decisions/` and
 * `docs/engineering/` surfaces as a browsable, access-controlled site.
 * Local-only providers (fern, mintlify) write config files; remote
 * providers (github) make API calls.
 */
export interface Wiki extends ProviderIdentity {
	readonly key: "wiki";
	/** Provision the wiki — write config files or call the provider API. */
	provision(opts?: WikiProvisionOpts): Promise<string>;
}

// ───────────────────────────────────────────────────────────────────────
// Capability map (key → implementation type) + cardinality helpers
// ───────────────────────────────────────────────────────────────────────

export interface CapabilityImpls {
	source: Source;
	ci: Ci;
	secrets: Secrets;
	environments: Environments;
	issues: Issues;
	deployment: Deployment;
	storage: Storage;
	auth: Auth;
	vault: Vault;
	dns: Dns;
	tooling: Tooling;
	notifications: Notifications;
	analytics: Analytics;
	observability: Observability;
	wiki: Wiki;
}

export type CardinalityFor<K extends CapabilityKey> = (typeof CARDINALITY)[K];

/** Resolved runtime shape: single → one impl; many → array. */
export type ResolvedCapability<K extends CapabilityKey> =
	CardinalityFor<K> extends "many" ? CapabilityImpls[K][] : CapabilityImpls[K];

export function isMulti<K extends CapabilityKey>(key: K): CardinalityFor<K> extends "many" ? true : false {
	return (CARDINALITY[key] === "many") as CardinalityFor<K> extends "many" ? true : false;
}
