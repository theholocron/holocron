import type { CARDINALITY } from "./capabilities.js";
/**
 * Capability interfaces — the contracts that providers implement.
 *
 * Each capability has a stable key (`'source'`, `'ci'`, …) and a
 * cardinality (`'single'` = one provider; `'many'` = several active
 * at once). The cardinality is part of the type contract via
 * `CardinalityFor<K>` so config resolution + command code can branch
 * statically.
 *
 * See `docs/wiki/specifications/tech-architecture.spec.md` for the design narrative
 * (issue: #74).
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
	| "errors"
	| "logs"
	| "monitoring"
	| "wiki"
	| "workers";

/** How many providers a capability resolves to: one (`"single"`) or several at once (`"many"`). */
export type Cardinality = "single" | "many";

// ───────────────────────────────────────────────────────────────────────
// Common shapes
// ───────────────────────────────────────────────────────────────────────

/** What every capability implementation carries: which capability it is and which provider backs it. */
export interface ProviderIdentity {
	/** The capability this implementation provides. */
	readonly key: CapabilityKey;
	/** The provider's name, e.g. `github` or `vercel`. */
	readonly providerName: string;
}

// ───────────────────────────────────────────────────────────────────────
// source — repos, branches, PRs, rulesets, settings, workflow files
// ───────────────────────────────────────────────────────────────────────

/** A repository ruleset as {@link Source.listRulesets} reports it. */
export interface Ruleset {
	/** The provider's numeric id for the ruleset. */
	id: number;
	/** The ruleset's name. */
	name: string;
	/** Whether the ruleset is enforced (`active`), only logged (`evaluate`) or off (`disabled`). */
	enforcement: "active" | "evaluate" | "disabled";
	/** What the ruleset applies to, e.g. `branch`; `undefined` when the provider does not say. */
	target?: string;
}

/** The repository settings {@link Source.updateRepoSettings} can change; a field left out is left alone. */
export interface RepoSettings {
	/** Allow merging a pull request by squashing its commits. */
	allow_squash_merge?: boolean;
	/** Allow merging a pull request with a merge commit. */
	allow_merge_commit?: boolean;
	/** Allow merging a pull request by rebasing its commits. */
	allow_rebase_merge?: boolean;
	/** Allow a pull request to be set to merge itself once its checks pass. */
	allow_auto_merge?: boolean;
	/** Always suggest updating PR branches when the base branch has new commits. */
	allow_update_branch?: boolean;
	/** Delete a pull request's head branch once it is merged. */
	delete_branch_on_merge?: boolean;
	/** The branch a fresh clone checks out. */
	default_branch?: string;
	/** Whether the repository has an issue tracker. */
	has_issues?: boolean;
	/** Whether the repository has discussions. */
	has_discussions?: boolean;
	/** Whether the repository has project boards. */
	has_projects?: boolean;
	/** Whether the repository has a wiki. */
	has_wiki?: boolean;
}

/** The repository a {@link Source} provider is scoped to. */
export interface RepoRef {
	/** The account or organization that owns the repository. */
	owner: string;
	/** The repository's name, without the owner. */
	name: string;
	/** The branch a fresh clone checks out. */
	defaultBranch: string;
}

/** A repository label as the canonical set passed to {@link Source.syncLabels} defines it. */
export interface LabelDef {
	/** The label's name. */
	readonly name: string;
	/** The label's colour as a hex string. */
	readonly color: string;
	/** What the label is for; an empty string when it has none. */
	readonly description: string;
}

/** The access level a team can hold on a repository, from least (`pull`) to most (`admin`). */
export type TeamPermission = "pull" | "triage" | "push" | "maintain" | "admin";

/** Shorthand `"slug"` defaults to `push` permission. */
export type TeamEntry = string | { slug: string; permission: TeamPermission };

/** The repository's own settings, as {@link Source.getRepoInfo} reports them. */
export interface SourceRepoInfo {
	/** `null` when none is set. */
	description: string | null;
	/** `null` when none is set. */
	homepage: string | null;
	/** The branch a fresh clone checks out. */
	defaultBranch: string;
	/** The topics set on the repository. */
	topics: string[];
	/** The merge and feature settings the provider reports; one it does not report is left out. */
	settings: RepoSettings;
}

/** A ruleset in full, as {@link Source.getRulesetDetail} reports it. */
export interface SourceRulesetDetail {
	/** The ruleset's name. */
	name: string;
	/** Whether the ruleset is enforced. */
	enforcement: Ruleset["enforcement"];
	/** The `type` of each rule, e.g. `deletion`, `pull_request`. */
	ruleTypes: string[];
	/** The status check contexts the ruleset requires. */
	requiredChecks: string[];
}

/** Which security features are on, as {@link Source.getSecurity} reports them. A feature left out was not reported. */
export interface SourceSecurity {
	/** Vulnerability alerts are on. */
	vulnerabilityAlerts?: boolean;
	/** Automated security updates are on. */
	automatedSecurityFixes?: boolean;
	/** Secret scanning is on. */
	secretScanning?: boolean;
	/** Secret scanning push protection is on. */
	secretScanningPushProtection?: boolean;
	/** Private vulnerability reporting is on. */
	privateVulnerabilityReporting?: boolean;
	/** Whether CodeQL default setup is configured. */
	codeScanningDefaultSetup?: boolean;
}

/** A member of a team, as {@link Source.teamMembers} reports it. */
export interface SourceTeamMember {
	/** The provider's stable id for the person; for GitHub, the numeric user id as a string. */
	id: string;
	/** What they are called now. Can change; never use it as a key. */
	login: string;
}

/** A file read by {@link Source.readFile}. */
export interface SourceFile {
	/** The file's text. */
	content: string;
	/** Opaque; hand it back to {@link Source.writeFile} to replace this exact version. */
	version: string;
}

/** Source hosting: the repository, its rulesets, settings, security features, workflow files and pull requests. */
export interface Source extends ProviderIdentity {
	/** Identifies this provider as the `source` capability. */
	readonly key: "source";

	/** Auth sanity-check. Throws ProviderApiError on auth failure. */
	whoami(): Promise<{ login: string }>;

	/** The repository this provider is scoped to: its owner, name and default branch. */
	getRepo(): Promise<RepoRef>;

	// Rulesets / branch protection
	/** Every ruleset on the repository. */
	listRulesets(): Promise<Ruleset[]>;
	/** Create a ruleset from the provider's own payload shape and return it. */
	createRuleset(payload: Record<string, unknown>): Promise<Ruleset>;
	/** Replace the ruleset with the given id using the provider's own payload shape. */
	updateRuleset(id: number, payload: Record<string, unknown>): Promise<Ruleset>;

	// Repo settings
	/** Change the repository's merge and feature settings; only the fields given are changed. */
	updateRepoSettings(settings: RepoSettings): Promise<void>;

	/**
	 * Classic branch protection — fallback for private repos on free plans
	 * where the Rulesets API (requires Team+) returns 403.
	 */
	protectBranch(branch: string, payload: Record<string, unknown>): Promise<void>;

	// Security toggles (idempotent; flip-or-noop)
	/** Turn on vulnerability alerts (dependency advisories) for the repository. */
	enableVulnerabilityAlerts(): Promise<void>;
	/** Turn on automated security updates, which open pull requests for vulnerable dependencies. */
	enableAutomatedSecurityFixes(): Promise<void>;
	/** Turn on secret scanning, and push protection with it. */
	enableSecretScanning(): Promise<void>;
	/** Turn on private vulnerability reporting, so people can report a vulnerability to the maintainers privately. */
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
	/** The file names in the workflow directory, sorted; empty when the directory does not exist. */
	listWorkflowFiles(): Promise<string[]>;
	/** The contents of one workflow file, or `null` when it does not exist. */
	readWorkflowFile(name: string): Promise<string | null>;
	/** Write one workflow file, creating the workflow directory if needed and replacing a file of that name. */
	writeWorkflowFile(name: string, contents: string): Promise<void>;
	/** Delete one workflow file; one that is already gone is not an error. */
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
	 * Set org-level custom property values on the repo. `string[]` for
	 * `multi_select` properties, plain `string` for everything else.
	 * Optional — providers that don't support custom properties omit this.
	 */
	syncProperties?(values: Record<string, string | string[]>): Promise<string>;

	/**
	 * Replace the repo's topic set with the supplied list.
	 * Optional — providers that don't support topics omit this.
	 */
	syncTopics?(topics: string[]): Promise<string>;

	/**
	 * Bring the repository's Actions variables in line with the declared ones: create what is missing, update what
	 * differs, leave the rest. With `prune`, also delete the ones the declaration does not name. With `dryRun`, read the current
	 * state and report what would change without writing. Returns a summary.
	 * Optional — providers without Actions variables omit this.
	 */
	syncVariables?(variables: Record<string, string>, opts?: { prune?: boolean; dryRun?: boolean }): Promise<string>;

	/**
	 * The same for the organization's variables, each with the repositories that can read it (`all` or `private`).
	 * Optional — providers without organization variables omit this.
	 */
	syncOrgVariables?(
		org: string,
		variables: Record<string, { value: string; visibility: "all" | "private" }>,
		opts?: { prune?: boolean; dryRun?: boolean }
	): Promise<string>;

	/**
	 * The repository's Actions variables as they are now, by name, with their values. Read-only.
	 * Optional — providers without Actions variables omit this.
	 */
	listVariables?(): Promise<Record<string, string>>;

	/**
	 * The organization's Actions variables as they are now, by name, with each value and the repositories that can read
	 * it (`selected` is a list this interface does not manage). Read-only. Throws {@link MissingTokenError} when the
	 * provider has no token that can read them.
	 * Optional — providers without organization variables omit this.
	 */
	listOrgVariables?(
		org: string
	): Promise<Record<string, { value: string; visibility: "all" | "private" | "selected" }>>;

	/**
	 * The repository's description, homepage, default branch, topics and merge/feature settings as they are now.
	 * Read-only. Optional — providers that cannot report them omit this.
	 */
	getRepoInfo?(): Promise<SourceRepoInfo>;

	/**
	 * The repository's custom property values as they are now, by property name. A property that is not set is left out.
	 * Read-only. Optional — providers without custom properties omit this.
	 */
	getProperties?(): Promise<Record<string, string | string[]>>;

	/**
	 * The repository's labels as they are now. Read-only.
	 * Optional — providers without labels omit this.
	 */
	listLabels?(): Promise<LabelDef[]>;

	/**
	 * The teams that have access to the repository, with each team's permission. Read-only.
	 * Optional — providers without a team concept omit this.
	 */
	listTeamAccess?(): Promise<Array<{ slug: string; permission: TeamPermission }>>;

	/**
	 * One ruleset in full: its enforcement, the types of its rules and the status checks it requires. Read-only.
	 * Optional — providers without rulesets omit this.
	 */
	getRulesetDetail?(id: number): Promise<SourceRulesetDetail>;

	/**
	 * Which security features are on. A feature the provider cannot report (the token cannot see it, the plan lacks it)
	 * is left out rather than reported as off. Read-only.
	 * Optional — providers without security toggles omit this.
	 */
	getSecurity?(): Promise<SourceSecurity>;

	/**
	 * Sync GitHub team repository access. String shorthand defaults to `push`.
	 * Optional — providers without a team concept omit this.
	 */
	syncTeams?(teams: TeamEntry[]): Promise<string>;

	/**
	 * The members of a team in `org` (default: the repo's organisation), by the provider's own stable id (for GitHub, the
	 * numeric user id, which survives a rename) and current login.
	 * Optional — providers without a team concept omit this.
	 */
	teamMembers?(teamSlug: string, org?: string): Promise<SourceTeamMember[]>;

	/**
	 * Read one file from a repository (default: this one), with the `version` a later {@link writeFile} must
	 * hand back. `null` when the file does not exist.
	 * Optional — providers that cannot read file contents omit this.
	 */
	readFile?(path: string, repo?: string): Promise<SourceFile | null>;

	/**
	 * Create or replace one file in a single commit. Pass the `version` {@link readFile} returned when
	 * replacing, and leave it out when creating: a write on top of a version that has since changed is
	 * refused (throws a `ProviderApiError` with status 409 or 422), so two writers cannot overwrite each other.
	 * Optional — providers that cannot write file contents omit this.
	 */
	writeFile?(
		path: string,
		content: string,
		opts: { message: string; version?: string; repo?: string }
	): Promise<void>;

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
	 * Every pull request in one state, newest first. `closed` includes the merged ones (`merged` tells them
	 * apart). Optional — providers without a PR concept omit this.
	 */
	listPullRequests?(state: "open" | "closed", repo?: string): Promise<PullRequest[]>;

	/**
	 * The commit SHAs of one pull request, in commit order. A squash-merged branch is not an ancestor of the
	 * base, so this is how a local tip is matched to a PR whose head commit is not in the checkout.
	 * Optional — providers without a PR concept omit this.
	 */
	listPullRequestCommits?(number: number, repo?: string): Promise<string[]>;

	/**
	 * Every branch on the remote, with the commit each points at.
	 * Optional — providers without branches omit this.
	 */
	listBranches?(repo?: string): Promise<SourceBranch[]>;

	/**
	 * Delete one branch on the remote. Idempotent: a branch that is already gone is success, not an error.
	 * Optional — providers that cannot delete a branch omit this.
	 */
	deleteBranch?(name: string, repo?: string): Promise<void>;

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

/** How GitHub Pages is set up for a repository, as {@link Source.configurePages} takes it. */
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

/** A branch on the remote and the commit it points at. */
export interface SourceBranch {
	/** The branch name, e.g. `fix/my-change`. */
	name: string;
	/** The commit the branch points at. */
	sha: string;
}

/** A pull request as {@link Source.getPullRequest} and {@link Source.listPullRequests} report it. */
export interface PullRequest {
	/** The pull request's number within the repository. */
	number: number;
	/** The pull request's title. */
	title: string;
	/** "open" | "closed" — GitHub marks merged PRs as "closed". */
	state: "open" | "closed";
	/** True when the PR was merged (as opposed to closed without merging). */
	merged: boolean;
	/** The head branch name (e.g. "fix/my-change"). */
	branch: string;
	/** The commit the head branch pointed at when the PR was last read. */
	headSha?: string;
	/** The address of the pull request's page. */
	url: string;
}

// ───────────────────────────────────────────────────────────────────────
// ci — workflow runs (history + status only)
// ───────────────────────────────────────────────────────────────────────

/** Where a workflow run is in its life; a finished run carries its outcome (`success`, `failure`, ...). */
export type CiRunStatus = "queued" | "in_progress" | "completed" | "cancelled" | "failure" | "success" | "skipped";

/** One run of a CI workflow. */
export interface CiRun {
	/** The provider's id for the run. */
	id: string | number;
	/** The workflow's name, falling back to the run's display title. */
	workflowName: string;
	/** The branch the run was triggered on. */
	branch: string;
	/** The commit the run was for. */
	sha: string;
	/** Where the run is, or how it ended once finished. */
	status: CiRunStatus;
	/** The address of the run's page. */
	url: string;
	/** When the run started, as an ISO timestamp. */
	startedAt: string;
	/** When the run finished, as an ISO timestamp; `undefined` while it is still going. */
	completedAt?: string;
}

/** What {@link Ci.listRuns} narrows its result by; a field left out does not filter. */
export interface CiRunFilter {
	/** Only runs on this branch. */
	branch?: string;
	/** Only runs in this state. */
	status?: CiRunStatus;
	/** The most runs to return. */
	limit?: number;
}

/** CI history: lists workflow runs and reads one back, with no way to start or change one. */
export interface Ci extends ProviderIdentity {
	/** Identifies this provider as the `ci` capability. */
	readonly key: "ci";
	/** Recent workflow runs, narrowed by `filter` when given. */
	listRuns(filter?: CiRunFilter): Promise<CiRun[]>;
	/** One workflow run by its id. */
	getRun(id: string | number): Promise<CiRun>;
}

// ───────────────────────────────────────────────────────────────────────
// secrets — CI/platform secrets sync destination (multi-scope)
// ───────────────────────────────────────────────────────────────────────

/** Where a secret lives: the repository, one of its environments, or the organization. */
export type SecretScope =
	{ kind: "repo" } | { kind: "environment"; name: string } | { kind: "organization"; name: string };

/** A destination for secrets (CI or platform secrets) that `holocron secrets sync` writes into. */
export interface Secrets extends ProviderIdentity {
	/** Identifies this provider as the `secrets` capability. */
	readonly key: "secrets";

	/** List secret NAMES (not values) at the given scope. */
	listSecrets(scope: SecretScope): Promise<string[]>;

	/** Idempotent upsert. Adapter handles encryption. */
	setSecret(scope: SecretScope, name: string, value: string): Promise<void>;

	/** Remove a secret at the given scope. */
	deleteSecret(scope: SecretScope, name: string): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// environments — named deployment environments
// ───────────────────────────────────────────────────────────────────────

/** Someone whose approval a deployment to an environment needs. */
export interface EnvironmentReviewer {
	/** Whether the reviewer is a person (`User`) or a team (`Team`). */
	type: "User" | "Team";
	/** Numeric id — GitHub's reviewer API silently ignores login strings. */
	id: number;
}

/** A named deployment environment and the protection rules on it. */
export interface Environment {
	/** The environment's name, e.g. `production`. */
	name: string;
	/** Who must approve a deployment to the environment. */
	reviewers?: EnvironmentReviewer[];
	/** Minutes a deployment waits before it proceeds. */
	waitTimer?: number;
	/** Whether the person who started a deployment is barred from approving it. */
	preventSelfReview?: boolean;
}

/** Named deployment environments and their protection rules. */
export interface Environments extends ProviderIdentity {
	/** Identifies this provider as the `environments` capability. */
	readonly key: "environments";
	/** Every environment on the repository. */
	listEnvironments(): Promise<Environment[]>;
	/** Create the environment, or bring an existing one of that name in line with `env`. */
	upsertEnvironment(env: Environment): Promise<void>;
	/** Delete the environment with the given name. */
	deleteEnvironment(name: string): Promise<void>;
}

// ───────────────────────────────────────────────────────────────────────
// issues — tracker
// ───────────────────────────────────────────────────────────────────────

/** A step in an issue's life that {@link Issues.transition} can move it to. */
export type LifecycleSlot = "inProgress" | "inReview" | "done";

/** The tracker-neutral group a provider's own status names fall into. */
export type StatusCategory = "open" | "in-progress" | "in-review" | "done" | "other";

/** A person in the issue tracker. */
export interface TrackerUser {
	/** The tracker's id for the person. */
	id: string;
	/** The name shown for the person. */
	displayName: string;
	/** Their email address, when the tracker shares it. */
	emailAddress?: string;
}

/** An issue in the tracker, in a shape that does not depend on the provider. */
export interface Issue {
	/** Human-readable key — "#42" for GitHub, "RANDO-42" for Jira. */
	key: string;
	/** Internal opaque id. */
	id: string;
	/** The issue's title. */
	summary: string;
	/** The issue's description; `undefined` when the provider did not return one. */
	body?: string;
	/** The provider's own status name. */
	status: string;
	/** The group the status falls into. */
	statusCategory: StatusCategory;
	/** Who the issue is assigned to; `null` when nobody. */
	assignee: TrackerUser | null;
	/** When the issue last changed, as an ISO timestamp. */
	updated: string;
	/** The address of the issue's page, when the provider gives one. */
	url?: string;
}

/** What {@link Issues.search} narrows its result by; a field left out does not filter. */
export interface IssueSearchFilter {
	/** Restrict to issues assigned to a specific id, or 'currentUser'. */
	assignee?: string | "currentUser";
	/** Exclude issues in the `done` category. */
	openOnly?: boolean;
	/** Max number of issues to return. Adapters apply a sensible default. */
	limit?: number;
}

/** What {@link Issues.transition} did. */
export interface LifecycleResult {
	/** False when no API write happened (already at target state). */
	transitioned: boolean;
	/** Status name the issue is in after this call. */
	status: string;
	/** Adapter-specific note (e.g., "label set" / "closed (completed)"). */
	via?: string;
}

/** What {@link Issues.doctor} found about the tracker connection, for `holocron doctor` to print. */
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

/** An issue tracker: finds, reads, creates, moves and comments on issues. */
export interface Issues extends ProviderIdentity {
	/** Identifies this provider as the `issues` capability. */
	readonly key: "issues";

	/** Currently-authenticated user. */
	getMyself(): Promise<TrackerUser>;

	/** Issues matching `filter`. */
	search(filter: IssueSearchFilter): Promise<Issue[]>;
	/** One issue by its human-readable key (e.g. `#42`). */
	get(key: string): Promise<Issue>;

	/** Open a new issue and return its key. */
	create(input: {
		summary: string;
		body?: string;
		labels?: string[];
		/** Numeric id or exact title (case-insensitive). */
		milestone?: string;
	}): Promise<{ key: string }>;

	/** Idempotent — `transitioned: false` if the issue is already at the target. */
	transition(key: string, slot: LifecycleSlot): Promise<LifecycleResult>;

	/** Add a comment to the issue. */
	comment(key: string, body: string): Promise<void>;

	/** Check the tracker connection and how the lifecycle slots map onto the tracker's statuses. */
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

/** A project on the deployment platform. */
export interface DeploymentProject {
	/** The platform's id for the project. */
	id: string;
	/** The project's name. */
	name: string;
	/** The framework preset the project uses, when the platform reports one. */
	framework?: string;
	/** True when the project is linked to a Git provider. */
	gitLinked?: boolean;
	/** The directory in the repository the project builds from; `null` or `undefined` for the repository root. */
	rootDirectory?: string | null;
}

/** The project settings {@link Deployment.updateProjectSettings} can change; a field left out is left alone. */
export interface DeploymentProjectSettings {
	/** Turn off preview deployments for the project. */
	previewDeploymentsDisabled?: boolean;
	/** Vercel-specific: whether the GitHub integration creates deployments
	 * for every push (false → only on-demand triggers). */
	gitProviderCreateDeployments?: boolean;
}

/** One deployment on the platform. */
export interface DeploymentRecord {
	/** The platform's id for the deployment. */
	id: string;
	/** The address the deployment is served at. */
	url: string;
	/** Branch this deployment was made from (null if not git-sourced). */
	branch: string | null;
	/** Named environment if one was targeted; undefined for branch previews. */
	target?: DeploymentTrigger;
	/** Where the deployment is in its build. */
	status: "queued" | "building" | "ready" | "error" | "cancelled";
	/** When the deployment was created, as an ISO timestamp. */
	createdAt?: string;
	/** The provider's own reason when `status` is `"error"` (e.g. Vercel's `Command "npm install" exited with 1`). */
	errorMessage?: string;
}

/** Config for `Deployment.deployFunction()` — source files, not a Git ref. */
export interface DeployFunctionConfig {
	/**
	 * Files to deploy, keyed by path relative to the project root (e.g.
	 * `"api/webhook.js"`, `"package.json"`). Content is plain text — the
	 * provider handles any wire-format encoding.
	 */
	files: Record<string, string>;
	/**
	 * Named deployment target. Omit for a preview deployment — same
	 * semantics as `triggerDeployment`'s `target`.
	 */
	target?: DeploymentTrigger;
}

/** What {@link Deployment.deployFunction} made. */
export interface DeployFunctionResult {
	/** The platform's id for the new deployment. */
	deploymentId: string;
	/** The address the deployment is served at. */
	url: string;
}

/** A deployment platform: projects, environment variables and deployments. */
export interface Deployment extends ProviderIdentity {
	/** Identifies this provider as the `deployment` capability. */
	readonly key: "deployment";
	/**
	 * Custom domain declared in the deployment provider's configuration.
	 * `holocron repo setup` attaches it to the configured project and hands any
	 * returned verification record to the `dns` capability.
	 */
	readonly domain?: string;

	/** Every project the account can see. */
	listProjects(): Promise<DeploymentProject[]>;
	/** Create if missing, otherwise return existing. Idempotent. */
	ensureProject(input: {
		name: string;
		framework?: string;
		/** "owner/repo" — passed when linking to a Git provider. */
		repo?: string;
		rootDirectory?: string;
	}): Promise<DeploymentProject>;

	/** Change the project's settings; only the fields given are changed. Returns the project afterwards. */
	updateProjectSettings(projectId: string, settings: DeploymentProjectSettings): Promise<DeploymentProject>;

	// Env vars on the deploy platform (Vercel-style: per-target).
	/** The names (not values) of the environment variables set on the project for `target`. */
	listEnvVars(projectId: string, target: DeploymentTarget): Promise<string[]>;
	/** Set an environment variable on the project for `target`, replacing any existing value. */
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

	/** One deployment by its id. */
	getDeployment(deploymentId: string): Promise<DeploymentRecord>;

	/**
	 * Deploy (or update) a project directly from source files, bypassing
	 * Git entirely — the non-git counterpart to `triggerDeployment`, for a
	 * consumer with no repo to link (a webhook receiver shipped as an npm
	 * package, for instance, rather than deployed from its own Git
	 * history). `projectId` may be a project name for providers that
	 * accept either. Optional — providers without a files-based deploy API
	 * omit this (e.g. Cloudflare Pages, git-source only today).
	 */
	deployFunction?(projectId: string, config: DeployFunctionConfig): Promise<DeployFunctionResult>;

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
	 * when the domain is already present. Optional: providers without a
	 * custom domain API omit this.
	 *
	 * Returns the DNS record needed to finish verification — `null` when
	 * the domain is already verified, or when the provider's API doesn't
	 * surface DNS-challenge details at all (e.g. Cloudflare Pages, whose
	 * custom-domain flow doesn't expose the same per-request verification
	 * handshake Vercel's does). Callers hand a non-null result straight
	 * to `dns.upsertRecord(result.zone, result.record)` — the exact
	 * pattern `setup` already uses for `Wiki.dnsRecord()`.
	 */
	ensureCustomDomain?(projectId: string, hostname: string): Promise<DnsRecordRequest | null>;
}

// ───────────────────────────────────────────────────────────────────────
// storage — DB / object / file store
// ───────────────────────────────────────────────────────────────────────

/** A branch of a database or other store, as {@link Storage.listBranches} reports it. */
export interface StorageBranch {
	/** The provider's id for the branch. */
	id: string;
	/** The branch's name. */
	name: string;
	/** Parent branch id; null for the root/main branch. */
	parentId: string | null;
	/** When the branch was created, as an ISO timestamp. */
	createdAt: string;
}

/** Options for {@link Storage.getConnectionString}. */
export interface ConnectionStringOptions {
	/** Use the pooled (PgBouncer) URL when available. Defaults to false. */
	pooled?: boolean;
}

/** A database or file store: connection strings and, for providers that have them, branches. */
export interface Storage extends ProviderIdentity {
	/** Identifies this provider as the `storage` capability. */
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
	/** Every branch of the store. */
	listBranches?(): Promise<StorageBranch[]>;
	/** Create a branch named `name`, copied from the `from` branch when given. */
	createBranch?(input: { name: string; from?: string }): Promise<StorageBranch>;
	/** Delete the branch (by name or id). */
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

/** What the auth provider needs the app to be given at runtime. */
export interface AuthDescription {
	/** The provider's name. */
	provider: string;
	/** Env-var names the app needs at runtime (CLERK_PUBLISHABLE_KEY, etc.). */
	envKeys: string[];
}

/** What {@link Auth.whoami} found out about the configured credentials. */
export interface AuthIdentity {
	/** The provider's name. */
	provider: string;
	/** Provider-specific health signal (user count, role, account name, etc.). */
	details?: Record<string, unknown>;
}

/** A user in the auth provider. */
export interface AuthUser {
	/** The provider's id for the user. */
	id: string;
	/** The user's email address. */
	email: string;
}

/** What {@link Auth.createUser} needs to make a user. */
export interface CreateAuthUserInput {
	/** The new user's email address. */
	email: string;
	/** The new user's password. */
	password: string;
	/** The new user's first name. */
	firstName?: string;
	/** The new user's last name. */
	lastName?: string;
}

/** Where to configure the auth provider's webhooks. */
export interface WebhookDashboardInfo {
	/** The address of the provider's webhook settings page. */
	url: string;
}

/** An identity provider: describes what an app needs from it, proves the credentials work and, where the provider allows, manages users and webhooks. */
export interface Auth extends ProviderIdentity {
	/** Identifies this provider as the `auth` capability. */
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

/** What happened to a user, in a form that does not depend on the auth provider. */
export type AuthEventType = "user.created" | "user.updated" | "user.deleted";

/** A user as a webhook event reports it, in a form that does not depend on the auth provider. */
export interface NormalizedAuthUser {
	/** The provider's id for the user. */
	id: string;
	/** The user's email address. */
	email: string;
	/** The user's first name; `null` or `undefined` when none is set. */
	firstName?: string | null;
	/** The user's last name; `null` or `undefined` when none is set. */
	lastName?: string | null;
	/** Provider-native fields preserved verbatim for consumers that need them. */
	raw?: Record<string, unknown>;
}

/** A webhook event from the auth provider, in a form that does not depend on the provider. */
export interface AuthEvent {
	/** What happened to the user. */
	type: AuthEventType;
	/** The user the event is about. */
	user: NormalizedAuthUser;
	/** ISO timestamp of when the event occurred. */
	occurredAt: string;
}

/** What a plugin's `parseWebhook` needs to verify and translate an incoming webhook request. */
export interface ParseWebhookInput {
	/** Raw request body (string or Buffer). */
	body: string | Buffer;
	/** Incoming HTTP headers — needed for signature verification. */
	headers: Record<string, string | string[] | undefined>;
	/** The signing secret the auth provider issued for this webhook endpoint. */
	signingSecret: string;
}

// ───────────────────────────────────────────────────────────────────────
// vault — REQUIRED source-of-truth for secrets
// ───────────────────────────────────────────────────────────────────────

/** The outcome of an idempotent `ensure*` call that creates a container. */
export interface EnsureResult {
	/** True when the resource already existed (idempotent no-op). */
	alreadyExists: boolean;
}

/** A secret store, the source of truth that `holocron secrets sync` reads from. */
export interface Vault extends ProviderIdentity {
	/** Identifies this provider as the `vault` capability. */
	readonly key: "vault";

	/**
	 * Read a secret by reference. The reference format is
	 * provider-specific (1P: "op://Vault/Item/field"; HashiCorp Vault:
	 * "kv/path#field"; etc.). Adapters validate the reference shape.
	 */
	read(reference: string): Promise<string>;

	/**
	 * Optional — read a secret by its bare name from the project and config this vault was set up with, instead of by a
	 * full reference. For a provider whose references name the project and config the options already carry (Doppler).
	 */
	readSecret?(name: string): Promise<string>;

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

/** The DNS record types a provider can manage. */
export type DnsRecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS" | "SRV" | "CAA";

/** A DNS record. */
export interface DnsRecord {
	/** The provider's id for the record; absent on a record not yet created. */
	id?: string;
	/** The record's type. */
	type: DnsRecordType;
	/** The record's name (the host it answers for). */
	name: string;
	/** The record's value, e.g. an address for `A` or a target host for `CNAME`. */
	content: string;
	/** Time to live in seconds; the provider's default when absent. */
	ttl?: number;
	/** Priority, for the record types that have one (`MX`, `SRV`). */
	priority?: number;
	/** Whether traffic goes through the provider's proxy; only providers that offer one use it. */
	proxied?: boolean;
}

/**
 * A DNS record a capability wants created, plus which zone it belongs
 * to — the shape `Wiki.dnsRecord()` and `Deployment.ensureCustomDomain()`
 * both hand off to `Dns.upsertRecord()`. Not tied to either capability;
 * any provider that needs "here's a record, go create it" returns this.
 */
export interface DnsRecordRequest {
	/** Zone apex passed as the first argument to `dns.upsertRecord`. */
	zone: string;
	/** The record to create or update. */
	record: DnsRecord;
}

/** DNS record management for a domain. */
export interface Dns extends ProviderIdentity {
	/** Identifies this provider as the `dns` capability. */
	readonly key: "dns";
	/** Every record in the domain's zone. */
	listRecords(domain: string): Promise<DnsRecord[]>;
	/** Create the record, or update the existing one that matches it, and return the result. */
	upsertRecord(domain: string, record: DnsRecord): Promise<DnsRecord>;
	/** Delete the record with the given id from the domain's zone. */
	deleteRecord(domain: string, id: string): Promise<void>;
	/**
	 * A `holocron doctor` smoke check with no specific domain to ask about —
	 * `listRecords` needs one, but doctor doesn't have one on hand. Verifies
	 * the token and reports how many zones it can see.
	 */
	whoami?(): Promise<{ ok: boolean; zones: number }>;
}

// ───────────────────────────────────────────────────────────────────────
// errors — error tracking / crash reporting
// logs — structured log aggregation
//
// Both are self-contained: they activate at runtime from env vars alone
// (`HOLOCRON_SENTRY_DSN`, `HOLOCRON_AXIOM_TOKEN` + `HOLOCRON_AXIOM_DATASET`)
// with no provider entry in `holocron.config`. The provider entry only
// enables `holocron repo setup` provisioning and `holocron doctor` checks.
// ───────────────────────────────────────────────────────────────────────

/** Error tracking: describes what an app needs at runtime and, where the provider allows, creates projects and relays alerts. */
export interface Errors extends ProviderIdentity {
	/** Identifies this provider as the `errors` capability. */
	readonly key: "errors";
	/** Returns the env var names the app reads at runtime for this provider. */
	describe(): Promise<{ provider: string; envKeys: string[] }>;
	/**
	 * Reachability probe. `null` means the check genuinely can't run right
	 * now on an otherwise-valid configuration (e.g. Sentry's optional `org`
	 * setting is unset — error ingestion still works from the DSN alone,
	 * `org` is only needed for the management-API calls `whoami` makes) —
	 * callers should fall back to `describe()`, not treat it as a failure.
	 * Still throws for a genuine failure (bad token, network error, etc.).
	 */
	whoami?(): Promise<{ org: string } | null>;
	/** Create the project if it is missing and return its DSN; `alreadyExists` is true when it was already there. */
	ensureProject?(input: { name: string; platform?: string }): Promise<{ dsn: string; alreadyExists: boolean }>;
	/**
	 * Make the tracker send its alerts to a relay (the Comlink Worker): an integration that posts to `webhookUrl`, and
	 * an alert rule on each project that uses it. Idempotent: an integration or rule with the same name is adopted and
	 * only what differs is changed. `clientSecret` is the integration's signing secret, handed to the caller to give
	 * the relay; it is a credential and must not be printed or stored anywhere but there. It is absent when the
	 * provider did not give it (some show it only when the integration is made).
	 */
	ensureRelay?(input: EnsureRelayInput): Promise<EnsureRelayResult>;
	/**
	 * Read back what `ensureRelay` makes without changing anything: the integration and, for each project, whether the
	 * alert rule is on it, enabled and sends through the integration. Never reads the signing secret.
	 * Optional — a provider with no relay omits it.
	 */
	inspectRelay?(input: InspectRelayInput): Promise<RelayState>;
}

/** What {@link Errors.ensureRelay} sets up at the error tracker. */
export interface EnsureRelayInput {
	/** The integration's name at the provider (also how an existing one is found). */
	name: string;
	/** Where the provider posts its alerts, e.g. `https://comlink.theholocron.dev/sentry`. */
	webhookUrl: string;
	/** The projects whose issues are sent. */
	projects: string[];
	/** The alert rule: its name, and the minutes between two notifications for one issue (default 5). */
	rule: {
		/** The alert rule's name at the provider (also how an existing one is found). */
		name: string;
		/** Minutes between two notifications for one issue; 5 when absent. */
		frequency?: number;
	};
}

/** Which integration and alert rule to read back: the names `ensureRelay` was given, without the parts that write. */
export interface InspectRelayInput {
	/** The integration's name at the provider. */
	name: string;
	/** The projects whose issues are sent. */
	projects: string[];
	/** The alert rule to look for. */
	rule: {
		/** Its name at the provider. */
		name: string;
	};
}

/**
 * The tracker's side of a relay as the provider holds it. Never carries the integration's signing secret: the read
 * does not ask for it.
 */
export interface RelayState {
	/** The integration, or undefined when none has that name. */
	integration?: {
		/** Where it posts alerts, or null when it has no webhook. */
		webhookUrl: string | null;
		/** Whether it is offered as an alert action. */
		alertAction: boolean;
	};
	/** One entry per requested project the rule is attached to; a project missing here has no such rule. */
	rules: Array<{
		project: string;
		enabled: boolean;
		/** Whether the rule sends through the integration. */
		sends: boolean;
	}>;
}

/** What {@link Errors.ensureRelay} did. */
export interface EnsureRelayResult {
	/** The integration that posts to the relay. */
	integration: {
		/** Whether it was made now rather than adopted. */
		created: boolean;
		/** For one adopted, the settings that differed and were changed. */
		updated: string[];
	};
	/** The alert rule that sends through the integration. */
	rule: {
		/** Whether it was made now rather than adopted. */
		created: boolean;
		/** For one adopted, the settings that differed and were changed. */
		updated: string[];
	};
	/** The integration's signing secret, for the relay to verify alerts with. A credential: never print or store it. */
	clientSecret?: string;
}

/** Log aggregation: describes what an app needs at runtime and, where the provider allows, creates the dataset. */
export interface Logs extends ProviderIdentity {
	/** Identifies this provider as the `logs` capability. */
	readonly key: "logs";
	/** Returns the env var names the app reads at runtime for this provider. */
	describe(): Promise<{ provider: string; envKeys: string[] }>;
	/** Verify the token by fetching the target dataset's info. */
	whoami?(): Promise<{ ok: boolean; dataset: string }>;
	/** Create the aggregation dataset if it does not already exist. Idempotent. */
	ensureDataset?(name: string): Promise<{ alreadyExists: boolean }>;
}

// ───────────────────────────────────────────────────────────────────────
// monitoring — external uptime / synthetic checks
//
// Unlike `errors`/`logs`, this one is NOT self-contained: there is no
// runtime SDK a monitored app imports — the check runs on the provider's
// own infrastructure, hitting a deployed URL from outside. The plugin's
// token is only ever used by `holocron repo setup`/`doctor` themselves
// (the standard 4-step `--token` / `HOLOCRON_<VENDOR>_TOKEN` /
// `<VENDOR_NATIVE_ENV>` / keyring precedence every other plugin uses),
// never by the monitored app. Vendor-neutral by design — a future
// Datadog/Pingdom/UptimeRobot provider implements the same shape;
// Checkly's own STATUS_CODE/EQUALS-style enums stay internal to that
// adapter, not leaked into this interface.
// ───────────────────────────────────────────────────────────────────────

/** What part of a response a {@link MonitoringAssertion} looks at. */
export type MonitoringAssertionSource = "status_code" | "response_time" | "body" | "header";

/** How a {@link MonitoringAssertion} compares the part of the response with its target. */
export type MonitoringAssertionComparison =
	"equals" | "not_equals" | "contains" | "not_contains" | "greater_than" | "less_than";

/** A condition a monitoring check's response must meet to pass. */
export interface MonitoringAssertion {
	/** The part of the response to look at. */
	source: MonitoringAssertionSource;
	/** How to compare it with `target`. */
	comparison: MonitoringAssertionComparison;
	/** Header name / JSON path — required when `source` needs one (e.g. `"header"`). */
	property?: string;
	/** The value to compare against. */
	target?: string;
}

/** The HTTP methods a monitoring check can use. */
export type MonitoringHttpMethod = "GET" | "POST" | "PUT" | "HEAD" | "DELETE" | "PATCH";

/** A monitoring check, in a form that does not depend on the provider. */
export interface MonitoringCheckInput {
	/** Also the idempotency key — `ensureCheck` finds-or-creates by this name. */
	name: string;
	/** The address to request. */
	url: string;
	/** The HTTP method; the provider's default when absent. */
	method?: MonitoringHttpMethod;
	/** Minutes between runs. Adapters round to their own supported values. */
	frequency?: number;
	/** Conditions the response must meet; the provider's default check when absent. */
	assertions?: MonitoringAssertion[];
	/** Whether the check runs; the provider's default when absent. */
	activated?: boolean;
	/**
	 * Provider-specific region/datacenter ids to run the check from (e.g.
	 * Checkly's `"us-east-1"`). Required by some providers — there's no
	 * universal default; an account with none configured rejects a check
	 * that omits this entirely.
	 */
	locations?: string[];
	/**
	 * Inverts pass/fail: set this when the check's expected-healthy
	 * response is itself an HTTP error status (e.g. asserting a 404/405
	 * on an endpoint that should reject certain requests). Without it,
	 * most providers classify any 4xx/5xx response as a failure at the
	 * platform level *before* evaluating `assertions` at all — a custom
	 * assertion that matches the "expected" error status does not
	 * override that baseline classification on its own.
	 */
	shouldFail?: boolean;
	/**
	 * Raw request body to send with the check — e.g. simulating a webhook
	 * delivery to verify signature/auth checking is wired correctly
	 * end-to-end, rather than just confirming the endpoint is reachable.
	 * Omitted entirely by default (no body sent).
	 */
	body?: string;
}

/** A check as the provider holds it. */
export interface MonitoringCheck {
	/** The provider's id for the check. */
	id: string;
	/** The check's name. */
	name: string;
}

/** A place the monitoring provider sends its alerts: a webhook that posts into a chat channel. */
export interface MonitoringAlertChannelInput {
	/** Also the idempotency key: an existing channel with this name is adopted and brought in line. */
	name: string;
	/** The chat service the message is formatted for. */
	format: "discord";
	/**
	 * Where alerts post: a credential, because anyone holding it can post to the channel. Absent when the webhook already
	 * existed and cannot be read back, in which case an existing alert channel keeps the URL it has and a missing one
	 * cannot be created.
	 */
	url?: string;
}

/** What {@link Monitoring.ensureAlertChannel} did. */
export interface MonitoringAlertChannelResult {
	/** Whether the channel was made now rather than already existing. */
	created: boolean;
	/** For an existing channel, what was brought in line (`"url"`, `"subscriptions"`). */
	updated: string[];
	/** How many checks the channel is subscribed to afterwards. */
	subscribed: number;
}

/**
 * An alert channel as the provider holds it, for `doctor notifications`. The URL it posts to is a credential and is not
 * returned: `webhookId` is the public part of a Discord webhook's URL, enough to tell which webhook it posts through.
 */
export interface MonitoringAlertChannelState {
	/** Whether a webhook alert channel with that name exists. */
	exists: boolean;
	/** Whether the provider formats its message for Discord. Absent when the channel does not exist. */
	discord?: boolean;
	/** The id of the Discord webhook the channel posts through, read from its URL. Absent when the URL is not one. */
	webhookId?: string;
	/** Names of the checks on the account that the channel is not subscribed to. */
	unsubscribed: string[];
	/** Names of the checks the channel is subscribed to but has switched off. */
	deactivated: string[];
}

/** External uptime and synthetic checks run from the provider's infrastructure against a deployed URL. */
export interface Monitoring extends ProviderIdentity {
	/** Identifies this provider as the `monitoring` capability. */
	readonly key: "monitoring";
	/**
	 * Checks this provider is configured to ensure exist — populated from
	 * the provider's own config (`holocron.config.ts`'s provider tuple),
	 * the same place `Deployment.domain` comes from. `holocron repo setup`
	 * loops this list and calls `ensureCheck` for each; empty when none
	 * are configured.
	 */
	readonly checks: readonly MonitoringCheckInput[];
	/**
	 * The service's own picture, for the webhook it posts through (see `feeds.monitoring`): where to fetch it, and the
	 * image itself as a `data:` URI for when that cannot be reached. Used when the config names no picture of its own.
	 */
	readonly icon?: {
		/** Where to fetch the picture. */
		url?: string;
		/** The picture itself as a `data:` URI, for when `url` cannot be reached. */
		dataUri?: string;
	};
	/** Auth sanity-check. Throws ProviderApiError on auth failure. */
	whoami?(): Promise<{ ok: boolean }>;
	/** Idempotent find-or-create-or-update by `input.name`. */
	ensureCheck(input: MonitoringCheckInput): Promise<{ check: MonitoringCheck; alreadyExists: boolean }>;
	/**
	 * Every check the provider's account holds now, in the same shape `checks` declares them, so the two can be
	 * compared. Read-only. Settings the provider cannot return are left out of each entry.
	 * Optional — a provider that cannot list its checks omits it.
	 */
	listChecks?(): Promise<MonitoringCheckInput[]>;
	/**
	 * Find-or-create-or-update an alert channel by name and subscribe every check the provider has to it. Checks made
	 * through an API are never subscribed automatically, so a later run subscribes the ones added since.
	 * Optional — a provider with no alert channels omits it.
	 */
	ensureAlertChannel?(input: MonitoringAlertChannelInput): Promise<MonitoringAlertChannelResult>;
	/**
	 * Read the alert channel named `name` and which of the account's checks it alerts for. Read-only, and never returns
	 * the URL it posts to. Optional — a provider with no alert channels omits it.
	 */
	inspectAlertChannel?(name: string): Promise<MonitoringAlertChannelState>;
}

// ───────────────────────────────────────────────────────────────────────
// Multi-provider capabilities — many can be active at once
// ───────────────────────────────────────────────────────────────────────

/** What {@link Tooling.doctor} found. */
export interface ToolingDoctorReport {
	/** Whether the tool is in a good state. */
	ok: boolean;
	/** What to show the person: what was found, or what is wrong. */
	message: string;
}

/** A developer tool kept in step with the repo; several can be active at once. */
export interface Tooling extends ProviderIdentity {
	/** Identifies this provider as the `tooling` capability. */
	readonly key: "tooling";

	/** Sync the tool's authoritative state from the repo. */
	sync(): Promise<void>;

	/** Check the tool is set up and working, and report what was found. */
	doctor(): Promise<ToolingDoctorReport>;
}

/** What an `ensure*` call found or made. `created: false` means it already existed. */
export interface EnsuredResource {
	/** The provider's id for the resource. */
	id: string;
	/** Whether the resource was made now rather than already existing. */
	created: boolean;
	/** For something that already existed: the settings that disagreed with the layout and were changed. */
	updated?: string[];
}

/** A webhook (or equivalent inbound URL) for a channel. */
export interface EnsureWebhookResult {
	/** Whether the webhook was made now rather than already existing. */
	created: boolean;
	/**
	 * The posting URL — a credential. Absent when the webhook already existed and
	 * the provider will not reveal it again (Discord returns the token only to
	 * the application that created the webhook, and only on creation).
	 */
	url?: string;
	/** For a webhook that already existed, or was just made: the settings that were set (`"avatar"`). */
	updated?: string[];
	/** Set when the webhook is fine but setting its avatar failed; the webhook and its `url` are still good. */
	avatarError?: string;
}

/**
 * Who may see a channel and post in it. Roles are named as in the layout's `roles`.
 * A channel inherits its category's access; stating `view` or `post` on the channel
 * replaces that field only.
 */
export interface NotificationsAccess {
	/** `"everyone"` (the default), or the roles that can see it: everyone else cannot. */
	view?: "everyone" | string[];
	/** `"everyone"` (the default), or the roles that can post; `[]` means only bots and webhooks. */
	post?: "everyone" | string[];
}

/** One channel in a {@link NotificationsLayout}. */
export interface NotificationsChannelLayout {
	/** The channel's name. */
	name: string;
	/** The channel's topic text. */
	topic?: string;
	/** Who may see and post. Overrides the category's, field by field. */
	access?: NotificationsAccess;
	/**
	 * Create an inbound webhook for the channel and store its URL in a secret.
	 * `true` uses the defaults; the object form overrides the webhook's display
	 * name and the secret's name.
	 */
	webhook?: boolean | { name?: string; secret?: string; avatar?: string };
	/**
	 * Other services that post into this channel through a webhook of their own. Each gets a dedicated webhook, whose
	 * URL goes straight to that service and is never stored as a secret, so revoking one service leaves the rest alone.
	 */
	feeds?: {
		/**
		 * The monitoring provider's alerts. `true` uses the defaults; the object form overrides the alert channel's name
		 * (default `Message to #<channel>`) and the dedicated webhook's name (default the provider's name, capitalised), and
		 * `avatar` gives that webhook a picture (PNG, JPEG or GIF): a file path or `https://` URL, or `{ url, image }`, where the `url` is tried first and the `image`, a file in the repo, is the fallback) in the provider's list of
		 * integrations. Left out, it wears the layout's `webhookAvatar`, as every webhook does. A picture is set only on a
		 * webhook that has none; the posts carry the service's own name and icon either way.
		 */
		monitoring?: boolean | { name?: string; webhook?: string; avatar?: string | { url?: string; image?: string } };
		/**
		 * The error tracker's alerts, carried in by the relay Worker (see `relay`). The channel gets a dedicated webhook
		 * (default the `errors` provider's name, capitalised) whose URL goes to the Worker as a secret and nowhere else.
		 * `avatar` is as for `monitoring`.
		 */
		errors?: boolean | { webhook?: string; avatar?: string | { url?: string; image?: string } };
	};
}

/**
 * Settings of the server itself. Channels are named as in the layout's `categories`; each field
 * left out is left alone.
 */
export interface NotificationsServerLayout {
	/** How established an account must be to talk: `none`, `low` (verified email), `medium` (5 minutes old), `high` (10 minutes in the server), `highest` (verified phone). */
	verification?: "none" | "low" | "medium" | "high" | "highest";
	/** Whether members are notified for every message or only when mentioned. */
	defaultNotifications?: "all" | "mentions";
	/** Which members' media is scanned: `off`, `noRoles` (members without a role) or `all`. */
	contentFilter?: "off" | "noRoles" | "all";
	/** Where the provider posts its own notices (member joins, boosts). */
	systemChannel?: string;
	/** The channel holding the server rules; required to turn community features on. */
	rulesChannel?: string;
	/** Where the provider sends its notices to the owners; required to turn community features on. */
	updatesChannel?: string;
	/** Turn community features (welcome screen, onboarding, discovery) on or off. */
	community?: boolean;
	/** The server's public description. Only providers that support one for the server's current state accept it. */
	description?: string;
	/** Preferred language, as a locale such as `en-US`. */
	locale?: string;
}

/** A message the provider posts in a channel and pins, so it stays at the top. */
export interface NotificationsPinnedLayout {
	/** A channel in the layout. */
	channel: string;
	/** The message text (Discord allows up to 2000 characters). */
	content: string;
}

/**
 * The screen a new member sees on joining: a short text and the channels worth visiting first.
 * Declaring it describes the whole screen: the text and the channels are set to exactly this, so to
 * switch it off, state them as well.
 */
export interface NotificationsWelcomeLayout {
	/** Whether the screen is shown. Defaults to `true`. */
	enabled?: boolean;
	/** A sentence or two about the server (Discord allows up to 140 characters). */
	description: string;
	/** The channels it points to, in order (Discord allows up to five). */
	channels: Array<{
		/** A channel in the layout. */
		channel: string;
		/** Why to visit it (Discord allows up to 50 characters). */
		description: string;
		/** A single emoji shown beside it. */
		emoji?: string;
	}>;
}

/** The questions a new member answers to be shown the channels that fit them. */
export interface NotificationsOnboardingLayout {
	/** Turn onboarding on or off. Left out, it is left as it is (Discord has requirements for turning it on). */
	enabled?: boolean;
	/** Channels every member starts with, by name. */
	defaultChannels?: string[];
	/** The questions asked, in order. */
	prompts?: Array<{
		title: string;
		/** One answer only (`true`) or any number. Defaults to `false`. */
		singleSelect?: boolean;
		/** The member must answer. Defaults to `false`. */
		required?: boolean;
		options: Array<{
			title: string;
			description?: string;
			emoji?: string;
			/** Channels this answer shows, by name. */
			channels?: string[];
			/** Roles this answer gives, by name from the layout's `roles`. */
			roles?: string[];
		}>;
	}>;
}

/**
 * Settings of the bot's own application (for Discord, what the developer portal shows). A field left
 * out is left alone.
 */
export interface NotificationsApplicationLayout {
	/** What the application's page says it is (Discord allows up to 400 characters). */
	description?: string;
	/** Short labels, up to five of up to twenty characters each. */
	tags?: string[];
	/** The default install link: what the bot is added with. Permissions are named, as in a role's. */
	install?: {
		/** The OAuth2 scopes the install link asks for. */
		scopes: string[];
		/** The permissions the bot is added with, named as in a role's. */
		permissions: string[];
	};
	/** `https://` link to the terms of service. */
	termsUrl?: string;
	/** `https://` link to the privacy policy. */
	privacyUrl?: string;
	/** `https://` link the provider calls to verify linked roles. */
	roleConnectionsUrl?: string;
	/**
	 * Privileged intents the bot needs. `members` lets it list who is in the server, which `sync-roles` needs to
	 * find who holds a role. `true` switches it on from code; `false` switches it off.
	 */
	intents?: {
		/** The server members intent: lets the bot list who is in the server. */
		members?: boolean;
	};
	/**
	 * OAuth2 redirect URIs that must be registered, for `notifications link`. The provider's API does not allow
	 * setting them, so these are only checked: `setup` and the doctor say what to add and where.
	 */
	redirectUris?: string[];
}

/**
 * Permissions of everyone on the server (for Discord, the @everyone role). Unlike a role's `permissions`,
 * these name only what to change: the rest of the set is left as it is.
 */
export interface NotificationsEveryoneLayout {
	/** Permissions to grant. */
	allow?: string[];
	/** Permissions to take away. */
	deny?: string[];
}

/** Where the person-to-member links live: one file in a repo, written by the sign-in flow and read by `sync-roles`. */
export interface NotificationsLinksLayout {
	/**
	 * The base URL of the hosted sign-in service (Sentinel), for example `https://sentinel.theholocron.dev`.
	 * `notifications link` asks it for `/api/link`; when it answers, sign-in happens there, and when it does not
	 * (down, out of quota, no route yet) the command signs in on this machine instead.
	 */
	hostedUrl?: string;
	/** The port the local sign-in listens on, which must be registered as `http://localhost:<port>/callback`. Defaults to 53682. */
	localPort?: number;
	/** `owner/name`. Defaults to `<org>/.github-private`. Keep it private: the file pairs two identities. */
	repo?: string;
	/** Defaults to `notifications/<provider>-links.json`. */
	path?: string;
}

/** A declared server layout, applied idempotently by `holocron notifications setup`. */
export interface NotificationsLayout {
	/**
	 * The channel set aside for test posts, by name. It must declare a webhook. `holocron doctor notifications`
	 * leaves one labelled test message there through its webhook (read back to prove delivery works) for a
	 * person to look at; the real channels are never given one unless `--deliver` posts and removes it.
	 */
	testChannel?: string;
	/** Where `sync-roles` finds which server member is which GitHub account. Only used by roles with a `team`. */
	links?: NotificationsLinksLayout;
	/** The bot's own application settings, applied with the server's. */
	application?: NotificationsApplicationLayout;
	/** What everyone on the server may do, applied with the server's settings. */
	everyone?: NotificationsEveryoneLayout;
	/**
	 * The picture every webhook gets unless its own `webhook.avatar` says otherwise: a path to a PNG,
	 * JPEG or GIF (from where the CLI runs) or an `https://` URL. It is set only on a webhook that has
	 * no picture yet -- a provider cannot say whether the one it holds is the same image.
	 */
	webhookAvatar?: string;
	/**
	 * The Worker that carries other services' alerts into the channels with a `feeds.errors`: built beforehand
	 * (`apps/comlink`), deployed by `notifications setup` with each channel's webhook URL as a secret, and served at
	 * `host`. Secrets set some other way (the service's signing secret) are kept across deploys.
	 */
	relay?: {
		/** Where the Worker answers, e.g. `comlink.theholocron.dev`. Its DNS record and route are managed. */
		host: string;
		/** The DNS zone the host is in. Default: found by the `dns` provider from the host itself, so rarely needed. */
		zone?: string;
		/** The Worker's name at the provider. Default `comlink`. */
		script?: string;
		/** The built Worker, relative to the repo root. Default `apps/comlink/dist/worker.js`. */
		code?: string;
		/**
		 * The error tracker's side, when its provider can manage it (`Errors.ensureRelay`): the projects whose issues
		 * are sent, the integration's name (default `Comlink`) and the alert rule's name (default
		 * `Errors to Discord (Comlink)`) and throttle in minutes (default 5). Left out, nothing is done at the tracker.
		 */
		errors?: {
			/** The tracker projects whose issues are sent. */
			projects: string[];
			/** The integration's name at the tracker; `Comlink` when absent. */
			integration?: string;
			/** The alert rule's name; `Errors to Discord (Comlink)` when absent. */
			rule?: string;
			/** Minutes between two notifications for one issue; 5 when absent. */
			frequency?: number;
		};
	};
	/** What a new member sees on joining, applied after the channels exist. */
	welcome?: NotificationsWelcomeLayout;
	/** The questions a new member answers, applied after the channels and roles exist. */
	onboarding?: NotificationsOnboardingLayout;
	/**
	 * Messages the provider posts and pins, applied after the channels exist. One that already says exactly this
	 * (posted by the provider and still pinned) is left alone; one that says something else is replaced.
	 */
	pinned?: NotificationsPinnedLayout[];
	/** Settings of the server itself, applied after its channels exist. */
	server?: NotificationsServerLayout;
	/** The categories to create, each with the channels under it. */
	categories?: Array<{ name: string; access?: NotificationsAccess; channels?: NotificationsChannelLayout[] }>;
	/** The roles to create. */
	roles?: Array<{
		name: string;
		mentionable?: boolean;
		/** `#rrggbb`. Omit to leave the colour alone. */
		color?: string;
		/** Show the role's members as their own group in the member list. */
		hoist?: boolean;
		/**
		 * The permissions the role holds, by the provider's own names (for Discord, `ViewChannel`,
		 * `SendMessages`, …). The list is exact: a permission not named is not granted.
		 */
		permissions?: string[];
		/**
		 * Keep this role's members equal to a team of the `source` provider (for GitHub, a team slug in
		 * the org): `holocron notifications sync-roles` gives the role to every team member who has linked
		 * their account, and takes it from linked people who have left the team.
		 */
		team?: string;
		/**
		 * Store the role's id in this secret, so a workflow can ping the role
		 * without anyone copying the id by hand. The id is not sensitive; a secret
		 * is used because the same token that writes the webhook secrets can write
		 * it, with no extra permission.
		 */
		secret?: string;
	}>;
}

/**
 * What a provider found on the server, limited to what a {@link NotificationsLayout}
 * asks about. Read-only: this is what `holocron doctor notifications` compares the
 * layout against.
 */
export interface ServerInspection {
	/** The bot's application as the provider has it, in the layout's terms, when the layout declares `application`. */
	application?: NotificationsApplicationLayout;
	/** Set when reading the application failed; `application` is then absent and means nothing. */
	applicationError?: string;
	/** What everyone may do, by permission name, when the layout declares `everyone`. */
	everyone?: {
		/** The permissions everyone holds now, by name. */
		permissions: string[];
	};
	/** Set when reading everyone's permissions failed; `everyone` is then absent and means nothing. */
	everyoneError?: string;
	/** The welcome screen as the server has it, in the layout's terms, when the layout declares `welcome`. */
	welcome?: NotificationsWelcomeLayout;
	/** Set when reading the welcome screen failed; `welcome` is then absent and means nothing. */
	welcomeError?: string;
	/** Whether each pinned message the layout declares is in place, in the layout's order. */
	pinned?: Array<{ channel: string; state: "ok" | "missing" | "different" }>;
	/** Set when reading the pinned messages failed; `pinned` is then absent and means nothing. */
	pinnedError?: string;
	/** Onboarding as the server has it, in the layout's terms, when the layout declares `onboarding`. */
	onboarding?: NotificationsOnboardingLayout;
	/** Set when reading onboarding failed; `onboarding` is then absent and means nothing. */
	onboardingError?: string;
	/** The server's own settings, in the layout's terms, when the layout declares `server`. */
	server?: NotificationsServerLayout;
	/** Set when reading the server's settings failed; `server` is then absent and means nothing. */
	serverError?: string;
	/** Names of the categories on the server. */
	categories: string[];
	/**
	 * Who can see and post in each category. `"custom"` means its overwrites are not an access the layout
	 * can state (a role-specific deny, a member overwrite, only some of the posting permissions).
	 */
	categoryAccess?: Record<string, Required<NotificationsAccess> | "custom">;
	/** The channels the layout asks about, as the server has them. */
	channels: Array<{
		name: string;
		/** The category it sits under, if any. */
		category?: string;
		topic?: string;
		/** Names of the webhooks on the channel. Only filled in for channels the layout gives a webhook or a feed. */
		webhooks: string[];
		/** Which of those webhooks have a picture of their own. */
		webhookAvatars?: string[];
		/** The id of each of those webhooks, by lower-cased name: the public part of its URL, never the token. */
		webhookIds?: Record<string, string>;
		/** Set when listing this channel's webhooks failed; `webhooks` is then empty and means nothing. */
		webhooksError?: string;
		/** Who can see and post; `"custom"` as for `categoryAccess`. */
		access?: Required<NotificationsAccess> | "custom";
	}>;
	/** The roles on the server. */
	roles: Array<{
		name: string;
		id: string;
		mentionable: boolean;
		/** `#rrggbb`, or absent for the default colour. */
		color?: string;
		hoist?: boolean;
		permissions?: string[];
	}>;
	/** Set when reading the roles failed; `roles` is then empty and means nothing. Not read at all when the layout declares none. */
	rolesError?: string;
}

/** Who a member turned out to be after signing in with the provider. */
export interface NotificationsSignedIn {
	/** Their id on the provider; for Discord, the user id. */
	member: string;
	/** Their name on the provider, when it gives one. */
	name?: string;
	/** The GitHub account the provider has verified they own; absent when they have none linked. */
	github?: {
		/** The GitHub user id, as a string. */
		id: string;
		/** The GitHub login. */
		login: string;
	};
}

/** The provider's "sign in" half: build the page a member opens, then learn who they are from the code it sends back. */
export interface NotificationsSignIn {
	/** The address of the provider's sign-in page, carrying the redirect address and state given. */
	authorizeUrl(input: { redirectUri: string; state: string }): Promise<string>;
	/** Trades the one-use `code` for who they are, and discards the token it was given. */
	complete(input: { redirectUri: string; code: string }): Promise<NotificationsSignedIn>;
}

/** What {@link Notifications.checkDelivery} saw: each step that went wrong is named in `problems`. */
export interface NotificationsDelivery {
	/** The message was posted through the channel's webhook. */
	posted: boolean;
	/** The message was found in the channel afterwards. */
	readBack: boolean;
	/** The message was deleted again. */
	removed: boolean;
	/** Set when the message was deliberately left in the channel (`keep`), so `removed` is false on purpose. */
	kept?: boolean;
	/** What went wrong at each failed step; empty when delivery worked. */
	problems: string[];
}

/** A member of the server, as {@link Notifications.roleMembers} reports it. */
export interface NotificationsMember {
	/** The provider's id for them; for Discord, the user id. */
	id: string;
	/** A display name for reports; absent when the provider does not give one. */
	name?: string;
}

/** Chat notifications: posts messages and, where the provider allows, builds the server a layout describes. */
export interface Notifications extends ProviderIdentity {
	/** Identifies this provider as the `notifications` capability. */
	readonly key: "notifications";

	/**
	 * Send a message. `channel` is provider-specific (Slack channel id,
	 * Discord webhook url-name, etc.); adapters resolve from config.
	 */
	send(channel: string, message: string): Promise<void>;

	/**
	 * The server layout the owner declared for this provider, if any. Read by
	 * `holocron notifications setup`; the provider just carries it from its options.
	 */
	readonly layout?: NotificationsLayout;

	/**
	 * Provisioning. All optional, all idempotent (look up by name, create only
	 * what is missing), and all need provider credentials beyond the posting
	 * URL — so a provider that only posts simply omits them.
	 */
	ensureCategory?(name: string, opts?: { access?: NotificationsAccess }): Promise<EnsuredResource>;
	/** Find or create a channel, under its category when named, with its topic and access. */
	ensureChannel?(input: {
		name: string;
		category?: string;
		topic?: string;
		access?: NotificationsAccess;
	}): Promise<EnsuredResource>;
	/** Find or create a webhook named `name` on the channel, creating the channel first if it is missing. */
	ensureWebhook?(input: {
		channel: string;
		name: string;
		category?: string;
		/** An image as a `data:` URI, set when the webhook has none. */
		avatar?: string;
	}): Promise<EnsureWebhookResult>;
	/**
	 * Proves a channel's webhook delivers: posts `text` through it, reads the post back from the channel and
	 * removes it again, unless `keep` is true, in which case the post is left in the channel (and the result
	 * has `kept` instead of `removed`). Never throws for a failed step; the result says which one failed.
	 * Posts a visible message, so callers choose the channel with care.
	 */
	checkDelivery?(input: {
		channel: string;
		name: string;
		category?: string;
		/** The message. The provider may format it (Discord renders markdown) and replaces `{channel}` with its link to the channel. */
		text: string;
		/** Leave the message in the channel instead of removing it, so a person can see it. */
		keep?: boolean;
	}): Promise<NotificationsDelivery>;

	/**
	 * Creates the server the layout describes, empty, owned by the provider's own bot, and makes it the server
	 * every other call in this run works on. Refuses when the config already names a server unless `force`.
	 */
	createServer?(input: { name: string; force?: boolean }): Promise<{ id: string; name: string }>;

	/** A single-use link, valid for a day, that lets one person join the server through the named channel. */
	inviteLink?(channel: string): Promise<string>;

	/** Whether a person is in the server. */
	hasMember?(memberId: string): Promise<boolean>;

	/** Hands the server to a member who has joined, so the bot no longer owns it. */
	transferServer?(memberId: string): Promise<void>;

	/** Who owns the server, and whether that is the provider's own bot. */
	serverOwner?(): Promise<{ id: string; isBot: boolean; name?: string }>;

	/**
	 * Who holds a role, by the provider's member id. Needs whatever permission the provider asks for to list
	 * members (for Discord, the privileged Server Members Intent). Throws if the role does not exist.
	 */
	roleMembers?(roleName: string): Promise<NotificationsMember[]>;

	/** Give a member the role; one who has it already is left alone. */
	addRoleMember?(roleName: string, memberId: string): Promise<void>;

	/** Take the role from a member; one who lacks it is left alone. */
	removeRoleMember?(roleName: string, memberId: string): Promise<void>;

	/** Sign-in used to learn which GitHub account a member is. Optional; needs an OAuth client secret. */
	signIn?(): NotificationsSignIn;

	/** Find or create a role; one that exists has its settings brought in line. */
	ensureRole?(input: {
		name: string;
		mentionable?: boolean;
		color?: string;
		hoist?: boolean;
		permissions?: string[];
	}): Promise<EnsuredResource>;

	/**
	 * Bring the server's own settings in line with the layout, changing only what differs. Returns the
	 * names of what it changed, empty when the server already matched.
	 */
	ensureServer?(settings: NotificationsServerLayout): Promise<{ updated: string[] }>;

	/** Bring the welcome screen in line with the layout, changing only what differs. Returns what it changed. */
	ensureWelcome?(welcome: NotificationsWelcomeLayout): Promise<{ updated: string[] }>;

	/** Post and pin the layout's messages, replacing any that differ. Returns the channels it changed. */
	ensurePinned?(pinned: NotificationsPinnedLayout[]): Promise<{ updated: string[] }>;

	/** Whether the bot holds the permission right now (the owner holds every one). Used to prove an elevation was taken back. */
	holdsPermission?(permission: string): Promise<boolean>;

	/** Bring onboarding in line with the layout, changing only what differs. Returns what it changed. */
	ensureOnboarding?(onboarding: NotificationsOnboardingLayout): Promise<{ updated: string[] }>;

	/** Bring the bot's application settings in line with the layout, changing only what differs. Returns what it changed. */
	ensureApplication?(application: NotificationsApplicationLayout): Promise<{ updated: string[]; todo?: string[] }>;

	/** Grant or take away the named permissions from everyone, changing only what differs. Returns what it changed. */
	ensureEveryone?(everyone: NotificationsEveryoneLayout): Promise<{ updated: string[] }>;

	/**
	 * Before anything is created, prove the credentials can do the parts of the layout that need
	 * more than the rest (for Discord, change the server's settings). Throws with the reason and how
	 * to fix it, so `setup` stops before it leaves a half-applied layout. Not called on a dry run.
	 */
	preflight?(layout: NotificationsLayout): Promise<void>;

	/**
	 * Check the provider-specific parts of the layout (colours, permission names, …) without
	 * touching the server, so `setup` can refuse a bad layout before it creates anything.
	 * Returns the first problem, or `undefined` when the layout is fine.
	 */
	validateLayout?(layout: NotificationsLayout): string | undefined;

	/**
	 * Smoke check for `holocron doctor`: prove the provisioning credentials work
	 * and name what they reach. Returns `null` when there is nothing to check (a
	 * config that only posts has no provisioning credentials), which doctor shows
	 * as "loaded" rather than as a failure. Throws when it is configured to
	 * provision but cannot (missing token, no access).
	 */
	whoami?(): Promise<{ target: string } | null>;

	/**
	 * Read what exists on the server, for the parts the layout cares about, without
	 * changing anything. Backs `holocron doctor notifications`.
	 */
	inspect?(layout: NotificationsLayout): Promise<ServerInspection>;
}

/** Product analytics: describes what an app needs at runtime and, where the provider allows, creates projects. */
export interface Analytics extends ProviderIdentity {
	/** Identifies this provider as the `analytics` capability. */
	readonly key: "analytics";
	/** Returns the env var names the app reads at runtime for this provider. */
	describe(): Promise<{ provider: string; envKeys: string[] }>;
	/** Reachability probe: proves the credentials work and names the organization they belong to. */
	whoami?(): Promise<{ org: string }>;
	/** Create the project if it is missing and return its ingestion token; `alreadyExists` is true when it was there. */
	ensureProject?(name: string): Promise<{ token: string; alreadyExists: boolean }>;
}

// ───────────────────────────────────────────────────────────────────────
// wiki — engineering knowledge publishing platform
// ───────────────────────────────────────────────────────────────────────

/** Options for {@link Wiki.provision}. */
export interface WikiProvisionOpts {
	/** Project display name used in the wiki title (e.g. "Holocron"). */
	name?: string;
}

/**
 * Reverse-proxy configuration returned by `Wiki.proxyConfig()`.
 * Used by `setup` to deploy a Worker that forwards traffic to the wiki
 * provider's ingress with the required headers injected.
 */
export interface WikiProxyConfig {
	/** Proxy target URL (e.g. "https://app.buildwithfern.com"). */
	target: string;
	/** Headers injected on every proxied request. */
	headers: Record<string, string>;
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
	/** Identifies this provider as the `wiki` capability. */
	readonly key: "wiki";
	/** Provision the wiki — write config files or call the provider API. */
	provision(opts?: WikiProvisionOpts): Promise<string>;
	/**
	 * DNS record needed for the custom domain, when one is configured.
	 * Returns null when no custom domain is set.
	 * Called by `setup` to provision the CNAME via the `dns` capability.
	 */
	dnsRecord?(): DnsRecordRequest | null;
	/**
	 * Reverse-proxy config when the wiki provider requires a Worker-level
	 * proxy in addition to the CNAME. Returns null when no proxy is needed.
	 * Called by `setup` to deploy the proxy via the `workers` capability.
	 */
	proxyConfig?(): WikiProxyConfig | null;
	/**
	 * Confirms a provider token resolves. Unlike `dns`/`workers`/`monitoring`'s
	 * `whoami()`, this is NOT a live reachability check — Fern (the only
	 * current `wiki` provider) exposes no lightweight endpoint to verify a
	 * token actually works; the only token-consuming operation is a full
	 * `fern generate` (holocron#1079). `ok: true` means "a token was found",
	 * not "the token works".
	 */
	whoami?(): Promise<{ ok: boolean }>;
}

/** Config for `Workers.deployScript()` — an arbitrary Worker, not a generated reverse-proxy. */
export interface DeployScriptConfig {
	/** The full Worker script source — a single ES module (`export default { fetch(...) {...} }`). */
	code: string;
	/**
	 * Secret bindings — `env.<name>` in the deployed Worker. Values are
	 * write-only; the provider never echoes them back, here or anywhere else.
	 */
	secrets?: Record<string, string>;
	/**
	 * Route pattern(s) this Worker should serve (e.g.
	 * `"sentinel.theholocron.dev/*"`). Omit for a Worker reached only via
	 * its `*.workers.dev` URL.
	 */
	routes?: string[];
}

/** A deployed Worker as the provider holds it, for `doctor notifications`. Binding names only: a value is never read. */
export interface WorkerScriptState {
	/** Whether a script with that name is deployed. */
	exists: boolean;
	/** The route patterns that serve the script in the zone of the host asked about. */
	routes: string[];
	/** The names of the secrets bound to the script. */
	bindingNames: string[];
}

/** What {@link Workers.deployScript} made. */
export interface DeployScriptResult {
	/** The deployed script's name at the provider. */
	scriptName: string;
}

/**
 * Edge Worker management capability.
 *
 * Deploys and manages Worker scripts. `upsertProxy` is the existing,
 * narrower case `setup` uses to wire wiki custom-domain reverse-proxies;
 * `deployScript` is the general case — any Worker, any code, its own
 * secrets — for a consumer that isn't a reverse-proxy (a webhook
 * receiver, for instance).
 */
export interface Workers extends ProviderIdentity {
	/** Identifies this provider as the `workers` capability. */
	readonly key: "workers";
	/**
	 * Deploy (or update) a reverse-proxy Worker for `hostname`.
	 * Forwards all `hostname/*` requests to `config.target`, injecting
	 * `config.headers` on each request.
	 */
	upsertProxy(hostname: string, config: WikiProxyConfig): Promise<void>;
	/** Deploy (or update) an arbitrary Worker script, optionally with secrets and routes. */
	deployScript(name: string, config: DeployScriptConfig): Promise<DeployScriptResult>;
	/**
	 * Set one secret binding on a script that is already deployed, leaving its code and every other binding alone.
	 * The value is write-only. `holocron secrets sync --worker` uses it to fan a vault out to a Worker.
	 */
	setSecret?(script: string, name: string, value: string): Promise<void>;
	/** The names (never the values) of the secrets bound to a deployed script. `holocron probe` uses it to see what a Worker has. */
	secretNames?(script: string): Promise<string[]>;
	/**
	 * Read a deployed script without changing it: whether it exists, which route patterns serve it in the zone `host`
	 * is in, and the names of its bindings. Read-only; `holocron doctor notifications` uses it to check the relay.
	 * Optional — a provider that cannot read its scripts omits it.
	 */
	inspectScript?(name: string, host: string): Promise<WorkerScriptState>;
	/**
	 * A `holocron doctor` smoke check — every other method either mutates or
	 * needs a specific script/zone doctor has no way to supply up front.
	 * Reports how many Worker scripts the token can see.
	 */
	whoami?(): Promise<{ ok: boolean; scripts: number }>;
}

// ───────────────────────────────────────────────────────────────────────
// Capability map (key → implementation type) + cardinality helpers
// ───────────────────────────────────────────────────────────────────────

/** Maps each capability key to the interface its provider implements. */
export interface CapabilityImpls {
	/** The `source` provider. */
	source: Source;
	/** The `ci` provider. */
	ci: Ci;
	/** The `secrets` provider. */
	secrets: Secrets;
	/** The `environments` provider. */
	environments: Environments;
	/** The `issues` provider. */
	issues: Issues;
	/** The `deployment` provider. */
	deployment: Deployment;
	/** The `storage` provider. */
	storage: Storage;
	/** The `auth` provider. */
	auth: Auth;
	/** The `vault` provider. */
	vault: Vault;
	/** The `dns` provider. */
	dns: Dns;
	/** The `tooling` provider. */
	tooling: Tooling;
	/** The `notifications` provider. */
	notifications: Notifications;
	/** The `analytics` provider. */
	analytics: Analytics;
	/** The `errors` provider. */
	errors: Errors;
	/** The `logs` provider. */
	logs: Logs;
	/** The `monitoring` provider. */
	monitoring: Monitoring;
	/** The `wiki` provider. */
	wiki: Wiki;
	/** The `workers` provider. */
	workers: Workers;
}

/** The cardinality (`"single"` or `"many"`) of the capability `K`. */
export type CardinalityFor<K extends CapabilityKey> = (typeof CARDINALITY)[K];

/** Resolved runtime shape: single → one impl; many → array. */
export type ResolvedCapability<K extends CapabilityKey> =
	CardinalityFor<K> extends "many" ? CapabilityImpls[K][] : CapabilityImpls[K];
