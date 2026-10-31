import type { DocsCoverageMode } from "@theholocron/astromech";
import type { LogLevel } from "@theholocron/observability/core";

import type { CapabilityKey, PagesConfig, TeamEntry } from "../../plugin/capabilities/index.js";

/** Structured-logging config. The Axiom **token** never lives here — only in
 *  env vars or the OS keyring — but the non-secret dataset name may. */
export interface LogConfig {
	/**
	 * Default log level. The lowest-priority level source: `--verbose` /
	 * `--quiet` and `HOLOCRON_LOG_LEVEL` both outrank it.
	 */
	level?: LogLevel;
	/**
	 * Axiom log-shipping. Set `axiom.dataset` to opt local runs into Axiom
	 * without exporting `HOLOCRON_AXIOM_DATASET` — the CLI then pairs it with
	 * the token from `HOLOCRON_AXIOM_TOKEN` / `AXIOM_TOKEN` or the OS keyring
	 * (`holocron auth set axiom[.<org>] <TOKEN>`). Env vars still win. In CI,
	 * prefer the `HOLOCRON_AXIOM_DATASET` variable.
	 */
	axiom?: {
		/** Target Axiom dataset, e.g. `"holocron-local"`. */
		dataset?: string;
	};
}

/**
 * CLI self-telemetry config — the committed, reviewable override layer over the
 * env-var + shipped-fallback activation (ADR-0007 / ADR-0008). No secret lives
 * here; the Sentry DSN and PostHog key come from env vars or ship as fallbacks.
 *
 * Precedence: `HOLOCRON_TELEMETRY=false` (env) → `telemetry.enabled` (this) →
 * default on. `enabled` never *re-enables* what the env var turned off.
 */
export interface TelemetryConfig {
	/**
	 * Repo-level opt-out — the committed peer of `HOLOCRON_TELEMETRY=false`.
	 * `false` installs the no-op sinks for the whole run. Default on.
	 */
	enabled?: boolean;
	/**
	 * Usage-analytics provider. `"none"` disables PostHog usage analytics while
	 * leaving error reporting (Sentry) untouched. Default `"posthog"`.
	 */
	analytics?: "posthog" | "none";
}

// ───────────────────────────────────────────────────────────────────────
// Raw config (what users write in holocron.config.json)
// ───────────────────────────────────────────────────────────────────────

/** Options a provider plugin receives; their shape is the plugin's own. */
export type ProviderOptions = Record<string, unknown>;

/**
 * The shape a capability config package's default export must satisfy.
 * Config packages let teams share a pre-bundled provider + options across
 * repos (Level 1 of the shareable-configs story, issue #75).
 *
 * @example
 * // @acme/holocron-vault/index.ts
 * import type { CapabilityConfigPackage } from '@theholocron/cli'
 * export default {
 *   provider: '1password',
 *   options: { vault: 'acme-app' },
 * } satisfies CapabilityConfigPackage
 */
export interface CapabilityConfigPackage {
	/** The provider's short name or package. */
	provider: string;
	/** Options passed to the provider. */
	options?: ProviderOptions;
}

/** A single provider: a name, or a `[provider, options]` tuple. */
export type SingleEntry = string | [provider: string, options: ProviderOptions];

/** Several providers: a list of names or `[provider, options]` tuples. */
export type MultiEntry = Array<string | [provider: string, options: ProviderOptions]>;

/** A capability's provider entry as written in the config. */
export type RawProviderEntry = SingleEntry | MultiEntry;

/** The `providers` block as written in the config. */
export type RawProvidersConfig = Partial<Record<CapabilityKey, RawProviderEntry>>;

/** A branch-protection preset: `balanced`, `strict` or `none`. */
export type RepoProtection = "balanced" | "strict" | "none";

/**
 * Raw `docs` config as written by the user. `build` is optional so the
 * field can be declared without committing to a build type yet; setup
 * will error if `docs` is present but `build` is absent.
 */
export interface DocsConfig {
	/**
	 * GitHub Pages build source.
	 * "workflow" → GitHub Actions  (PUT { build_type: "workflow" })
	 * "branch"   → classic gh-pages branch (PUT { build_type: "legacy", source: { branch: "gh-pages", path: "/" } })
	 * When absent, Pages is not managed by `holocron repo setup`.
	 */
	build?: "workflow" | "branch";
	/**
	 * Custom domain / CNAME (e.g. "docs.theholocron.dev").
	 * When set and `homepage` is not explicitly provided, setup derives
	 * `homepage` as `https://{domain}/` for package.json and the repo website field.
	 */
	domain?: string;
	/** Enforce HTTPS. Only effective once the custom domain is DNS-verified. */
	https?: boolean;
}

/** GitHub custom properties synced to the org dashboard. */
export interface RepoProperties {
	/** The repo's lifecycle stage. */
	lifecycle?: "active" | "experimental" | "deprecated";
	/** Whether the repo is open source. */
	open_source?: boolean;
	/** Where the code runs. */
	runtime_environment?: "node" | "browser" | "universal" | "none";
	/** Whether the repo depends on external packages. */
	uses_external_packages?: boolean;
}

/**
 * GitHub Actions variables, declared so a workflow that reads `vars.NAME` finds it. Values are plain text, so
 * never put a secret here; secrets go through the `secrets` capability.
 */
export interface RepoVariables {
	/** Repository-level variables. */
	repo?: Record<string, string>;
	/**
	 * Organization-level variables. A bare string is visible to every repository; `visibility: "private"` limits it
	 * to private ones. Declare these in one repo only (the one that owns the org's configuration).
	 */
	org?: Record<string, string | { value: string; visibility?: "all" | "private" }>;
	/** Delete variables that exist but are not declared here. Off by default: they are left alone. */
	prune?: boolean;
}

/**
 * The names of the secrets that must exist for this repository's workflows to work, so `holocron doctor secrets`
 * can say which are missing. Only names go here, never values; `holocron secrets set` and `secrets sync` write
 * them. The secrets the config already implies (the notification layout's webhooks and roles, a Chromatic project
 * token) are expected without being listed again. A secret that exists but is not listed is never a problem.
 */
export interface RepoSecrets {
	/** Repository secrets. */
	repo?: string[];
	/** Organization secrets. Declare these in one repo only (the one that owns the org's configuration). */
	org?: string[];
	/** Environment secrets, by environment name. */
	environments?: Record<string, string[]>;
	/**
	 * The vault environments `holocron secrets sync` fills secrets from. `holocron doctor secrets` expects the
	 * keys each one holds (or lists) at its scope. Names only; the doctor never reads or prints a value.
	 */
	sync?: RepoSecretsSync[];
}

/** One vault environment that `holocron secrets sync` pushes into GitHub secrets, declared so the doctor can check them. */
export interface RepoSecretsSync {
	/** The vault environment id, as given to `holocron secrets sync <environmentId>`. */
	environment: string;
	/**
	 * The vault keys pushed to GitHub (the `--github-secret` allowlist). Omit it for every key the vault
	 * environment holds, which the doctor then asks the `vault` provider to list.
	 */
	keys?: string[];
	/** Where the secrets land, as `--github-secret-scope` words it: `"repo"` (the default), `"env=<name>"` or `"org=<name>"`. */
	scope?: string;
}

/** Per-repo switches for the repo-validation checks (spec `tech-api-docs`, #1368). */
export interface RepoValidationConfig {
	/**
	 * How strictly this repo enforces doc-comment coverage of its public API (`holocron probe docs patch`, the
	 * `Docs coverage` workflow and the `documentation` Codecov flag). `"off"` (the default) does nothing; `"warn"`
	 * reports without failing and posts informational Codecov statuses; `"required"` fails the check and posts statuses
	 * that are not informational. It never adds a status to the branch-protection required checks: that stays in
	 * `extraRequiredChecks`.
	 */
	docsCoverage?: DocsCoverageMode;
}

/** The `repo` block: how the GitHub repository is set up and kept in sync by `holocron repo setup`. */
export interface RepoConfig {
	/** "owner/name" — the GitHub repository coordinate. Derived from the git remote when absent. */
	name?: string;
	/**
	 * GitHub's repo-level default branch (`HEAD`) — what a fresh clone checks
	 * out, what `gh pr create`/the compare UI target by default, and what
	 * Sentinel's `validateConfig()` reads (D6: the App only ever reads config
	 * from the repo's default branch, never a PR ref, as a security boundary
	 * — never widen that to read PR branches instead of fixing this field).
	 * Synced by `holocron repo setup`. Omit to leave GitHub's current setting
	 * untouched — most repos never need this. Exists for a repo using a
	 * `main`/`alpha` prerelease-channel split (CLAUDE.md's Releases section)
	 * where active development happens on a non-`main` branch: set this to
	 * that branch so Sentinel validates against what's actually being
	 * developed, then change it back once that branch merges to `main` for a
	 * stable cut and stops being the active branch.
	 */
	defaultBranch?: string;
	/**
	 * Branch protection preset applied by `holocron repo setup`. When omitted,
	 * no protection is applied and no `branch_protection_level` property is set.
	 * Required-status-check contexts for `"strict"` are derived from the task
	 * manifest — `{ required: true }` tasks + top-level `extraRequiredChecks`
	 * (see `astromech.requiredChecks()`).
	 */
	protection?: RepoProtection;
	/**
	 * GitHub teams granted repository access. Synced by `holocron repo setup`, which
	 * also writes `.github/CODEOWNERS` for teams with write-or-higher permission.
	 * String shorthand defaults to `push` (Write).
	 */
	teams?: TeamEntry[];
	/** GitHub topics set on the repository. */
	topics?: string[];
	/** GitHub custom properties synced to the org dashboard. */
	properties?: RepoProperties;
	/** GitHub Actions variables reconciled by `holocron repo setup`. */
	variables?: RepoVariables;
	/** The secrets that must exist, checked by `holocron doctor secrets`. Names only; nothing writes them. */
	secrets?: RepoSecrets;
}

/** An application in the repo. */
export interface AppConfig {
	/** The application's name. */
	name: string;
	/** The application's directory. */
	path: string;
	/** What kind of application it is. */
	kind?: string;
}

/** The `doctor` block. */
export interface DoctorConfig {
	/** Names of the checks `doctor` runs. */
	checks?: string[];
}

/** The `env` block: how the project's environment variables are named and documented. */
export interface EnvConfig {
	/**
	 * Namespace prefixes used by this project's env vars.
	 * Listed from least- to most-specific (cascade model — last wins).
	 * Tooling reads this to generate `.env.example`, validate required
	 * vars, and produce documentation.
	 *
	 * @example
	 * // Project-only prefix
	 * namespaces: ["CLI_TEMPLATE"]
	 *
	 * // Org-wide defaults + project-specific overrides
	 * namespaces: ["HOLOCRON", "MY_CLI"]
	 */
	namespaces?: string[];
}

/**
 * A single Chromatic project entry in a `verification.visualRegression`
 * task's `chromatic-projects` config.
 * Each entry produces one matrix job in CI, publishing to a separate Chromatic project.
 *
 * The `tokenName` maps to a repository secret named `CHROMATIC_PROJECT_TOKEN_<TOKENNAME>`.
 * Additional fields correspond to chromaui/action inputs and are passed through directly.
 *
 * @see https://www.chromatic.com/docs/monorepos/
 */
export interface ChromaticProjectConfig {
	/**
	 * Secret suffix. The CI job reads `CHROMATIC_PROJECT_TOKEN_<tokenName>`.
	 * Must be uppercase (e.g. `"WEB"`, `"UI"`).
	 */
	tokenName: string;
	/**
	 * Path to run the Chromatic build from, relative to the repo root.
	 * Typically the package directory (e.g. `"apps/web"`, `"packages/ui"`).
	 */
	workingDir: string;
	/**
	 * Script name to build Storybook. Defaults to `"build:storybook"`.
	 * Must accept `--output-dir` pass-through (use `turbo run … --` at root).
	 */
	buildScript?: string;
	/**
	 * Path to the Storybook folder relative to `workingDir`, for TurboSnap.
	 * Tells Chromatic where to find `.storybook/` when the Storybook config
	 * is in a subdirectory. Corresponds to `--storybook-base-dir`.
	 */
	storybookBaseDir?: string;
	/**
	 * Glob patterns of files/dirs that should NOT trigger a TurboSnap bailout
	 * when changed. Useful for ignoring non-UI changes in a monorepo
	 * (e.g. `"./packages/!(ui)/**"` to focus TurboSnap on the UI package).
	 * Corresponds to `--untraced`. Accepts a single glob string or array.
	 */
	untraced?: string | string[];
	/**
	 * Glob patterns matching story files to snapshot. When set, only matching
	 * stories are captured. Corresponds to `--only-story-files`.
	 * Cannot be combined with `onlyStoryNames`.
	 */
	onlyStoryFiles?: string;
	/**
	 * Exit with code 0 even when visual changes are detected.
	 * Useful during initial setup before baselines are approved.
	 * Corresponds to `--exit-zero-on-changes`.
	 */
	exitZeroOnChanges?: boolean;
}

/**
 * A single Storybook app in a deploy workflow config.
 * `name` becomes the sandbox sub-path (`_site/sandbox/<name>/`).
 * `path` is the working directory relative to the repo root; defaults to `"."` (repo root) when omitted.
 */
export interface StorybookDeployProject {
	/** The sub-path under `_site/sandbox/` the Storybook app is published to. */
	name?: string;
	/** The app's working directory relative to the repo root; defaults to `"."`. */
	path?: string;
}

/**
 * Typed `with:` inputs for reusable workflows.
 *
 * `chromatic-projects` (on the `verification.visualRegression` task) takes a
 * `ChromaticProjectConfig[]` directly; each entry's `untraced` glob list may
 * be authored as an array and is newline-joined for you.
 *
 * `docs` / `storybook` are high-level deploy shorthand that `holocron repo setup`
 * translates to `type` / `storybook-projects` before writing the thin caller.
 * They also drive automatic `paths:` derivation so you never need to write
 * `paths:` manually for deploy entries.
 */
export type WorkflowWithConfig = Record<string, unknown> & {
	"chromatic-projects"?: ChromaticProjectConfig[];
	/**
	 * Docs deployment shorthand. `true` uses the org-standard `docs/` directory;
	 * `{ path: "custom" }` uses a custom directory. Both derive a `paths:` entry automatically.
	 */
	docs?: true | { path: string };
	/** Storybook apps to deploy alongside docs. Each entry's `path` is appended to `paths:`. */
	storybook?: StorybookDeployProject[];
};

/**
 * A `tasks` manifest entry in object form. A bare string entry is shorthand
 * for `{ name, ci: true, local: true }`.
 */
export interface TaskEntryConfig {
	/** The task's name. */
	name: string;
	/** Inputs passed to the task's reusable workflow. */
	with?: WorkflowWithConfig;
	/** Path filters for the generated workflow's triggers. */
	paths?: string[];
	/** Linters this task runs. */
	linters?: string[];
	/** Emit a `.github/workflows/<name>.yml` thin caller + include in `holocron run ci`. Default `true`. */
	ci?: boolean;
	/** Write a `package.json` script + let `holocron run <name>` resolve the task. Default `true`. */
	local?: boolean;
	/** The task's CI check context is a required status check + part of `holocron run ci`'s default run. */
	required?: boolean;
	/**
	 * Per-repo additions to this task's generated `turbo.json` entry —
	 * a separate channel from `with:` (that's the reusable *workflow's*
	 * inputs; this is local turbo cache config, unrelated). No-op for a
	 * task with no turbo fan-out config in the registry. Mirrors
	 * astromech's own `TaskEntry["turbo"]` — kept in sync by hand, since
	 * this package doesn't depend on astromech directly.
	 */
	turbo?: {
		/** Extra env vars turbo hashes into this task's cache key, appended to the registry default. */
		passThroughEnv?: string[];
		/**
		 * Extra input globs appended to the registry default's `inputs`
		 * (holocron#845) — for a package whose layout the registry
		 * default doesn't cover (e.g. a flat-layout package with no
		 * `src/` directory at all).
		 */
		inputs?: string[];
		/** Extra tasks this one waits for, appended to the registry default's `dependsOn` (turbo syntax: `"<package>#<task>"`). */
		dependsOn?: string[];
	};
}

/** A `holocron.config` as a user writes it; `defineConfig` types it. */
export interface HolocronConfig {
	/** Project name. Derived from package.json when absent. */
	name?: string;
	/** A one-line description of the project. */
	description?: string;
	/** Project homepage URL. Synced to package.json#homepage and the GitHub repo's website field by `holocron repo sync`. */
	homepage?: string;
	/**
	 * Active org name for namespaced keyring lookup. When set, token resolution
	 * tries `<service>.<org>` before the unnamespaced `<service>` fallback, so
	 * a single machine can hold credentials for multiple GitHub orgs without
	 * collision. Overridden by `--org` CLI flag or `HOLOCRON_ORG` env var.
	 */
	org?: string;
	/**
	 * Org canonical domain (e.g. `"theholocron.dev"`). Subdomains are derived
	 * from this — `preview: true` on a deploy workflow resolves the preview base
	 * domain as `preview.<domain>`, giving URLs like `<repo>-pr-<n>.<domain>`.
	 */
	domain?: string;
	/**
	 * Repository identity and metadata. When set, `PluginLoader` injects
	 * `repo.name` into every plugin's `RuntimeContext.repo` so plugins that
	 * need a repo (github, etc.) don't require `--repo` on every invocation.
	 * `--repo` on the command line still overrides.
	 */
	repo?: RepoConfig;
	/** Per-repo switches for the repo-validation checks. */
	repoValidation?: RepoValidationConfig;
	/**
	 * The task manifest — what this repo runs. Each entry is a task name
	 * (backed by a reusable workflow in `theholocron/.github`), or the object
	 * form to pass `with:` inputs. `@theholocron/astromech` reads this as the
	 * single source for `holocron run` / `holocron run ci` / the generated CI
	 * workflows / `package.json` scripts.
	 *
	 * Supported values (intent-facing vocabulary — epic #672, D3):
	 *   "verification.unitTests" | "verification.visualRegression" | "verification.typeSafety" | "verification.performance" |
	 *   "sourceQuality.staticAnalysis" | "sourceQuality.formatting" |
	 *   "sourceQuality.structuredDataValidation" | "sourceQuality.deadCodeAnalysis" |
	 *   "security.secretDetection" | "security.codeScanning" | "security.tokenExpiry" |
	 *   "delivery.build" | "delivery.publish" | "delivery.deploy" | "delivery.bundleSize" |
	 *   "platform.repoSync" | "platform.notifyCheck" | "platform.commitStandards" | "platform.repoValidation" |
	 *   "knowledge.wiki" | "knowledge.docs" | "knowledge.components" |
	 *   "review" | "tag" | "stale" | "greetings" | "dependencies" | "bookkeeping"
	 *
	 * `holocron repo setup` writes `.github/workflows/<name>.yml` for each entry,
	 * calling the corresponding reusable workflow in `theholocron/.github`.
	 * Files are overwritten on each run — they are generated artifacts.
	 *
	 * ### delivery.deploy / knowledge.docs / knowledge.components
	 * `delivery.deploy` uses `docs` and/or `storybook` in `with:` — setup
	 * derives `paths:` automatically. `docs: true` uses the org-standard
	 * `docs/` directory; `docs: { path: "custom" }` overrides it.
	 * `knowledge.docs` / `knowledge.components` are the same underlying
	 * mechanism, each dedicated to exactly one type — they imply the
	 * corresponding shorthand, so a repo using them never has to spell out
	 * `docs: true` / `storybook: […]` itself.
	 *
	 * ```ts
	 * // Docs only (standard layout)
	 * { name: "delivery.deploy", with: { docs: true } }
	 * // …or equivalently, the dedicated task:
	 * "knowledge.docs"
	 *
	 * // Docs + monorepo storybooks
	 * {
	 *   name: "delivery.deploy",
	 *   with: {
	 *     docs: true,
	 *     storybook: [
	 *       { name: "web", path: "apps/web" },
	 *       { name: "ui", path: "packages/ui" },
	 *     ],
	 *   },
	 * }
	 *
	 * // Non-standard docs location
	 * { name: "delivery.deploy", with: { docs: { path: "packages/site" } } }
	 * ```
	 *
	 * ### verification.visualRegression
	 * Its own task, not a `verification.unitTests` sub-job (holocron#394/#1062)
	 * — GitHub evaluates a job's `if:` before expanding its `strategy.matrix`,
	 * so no `chromatic-projects` default can make a *disabled* Chromatic job
	 * disappear from PR checks; only not generating the job at all does. Omit
	 * this task entirely for a repo that doesn't use Chromatic — no workflow,
	 * no job, no check, not even a skipped one.
	 *
	 * For a single-project repo, use a `CHROMATIC_PROJECT_TOKEN` repository
	 * secret with `tokenName: "default"`:
	 * ```ts
	 * {
	 *   name: "verification.visualRegression",
	 *   with: { "chromatic-projects": [{ tokenName: "default", workingDir: "." }] },
	 * }
	 * ```
	 *
	 * For monorepos with multiple Storybooks, list one entry per project:
	 * ```ts
	 * {
	 *   name: "verification.visualRegression",
	 *   with: {
	 *     "chromatic-projects": [
	 *       { tokenName: "WEB", workingDir: "apps/web" },
	 *       { tokenName: "UI",  workingDir: "packages/ui" },
	 *     ],
	 *   },
	 * }
	 * ```
	 * Each `tokenName` maps to a repository secret named
	 * `CHROMATIC_PROJECT_TOKEN_<TOKENNAME>`.
	 *
	 * @example
	 * ["sourceQuality.staticAnalysis", { "name": "delivery.publish", "with": { "run-build": false } }]
	 * { "name": "delivery.deploy", "with": { "docs": true } }
	 */
	tasks?: Array<string | TaskEntryConfig>;
	/**
	 * Opt out of `holocron repo sync`'s `package.json` script writes. Default `true`.
	 */
	syncScripts?: boolean;
	/**
	 * The command the synced `"holocron"` `package.json` script runs. Default
	 * `"holocron"` (the installed bin). This repo overrides it to run its own
	 * build (`"node cli/cli/dist/cli.mjs"`).
	 */
	holocronScript?: string;
	/**
	 * Required status-check contexts not backed by a `required` task (codecov
	 * gates, the bundle-build check, …). `holocron repo setup` appends these to the
	 * task-derived list from `astromech.requiredChecks()`.
	 */
	extraRequiredChecks?: string[];
	/**
	 * Git hooks `holocron repo setup` installs. `true` / `{ prePush: true }` writes
	 * `.husky/pre-push` (runs `holocron run ci` before every push); `false` /
	 * `{ prePush: false }` opts out. Omitted → on for `protection: "strict"`,
	 * off otherwise. `--hooks` / `--no-hooks` on `holocron repo setup` override.
	 */
	hooks?: boolean | { prePush?: boolean };
	/** Which provider backs each capability. */
	providers: RawProvidersConfig;
	/** Applications in the repo. */
	apps?: AppConfig[];
	/** Settings for `holocron doctor`. */
	doctor?: DoctorConfig;
	/**
	 * Agent runtime that determines where skills are installed by `holocron repo setup`.
	 * Skills are installed to `.agents/skills/<name>/` (canonical) with a
	 * relative symlink at the agent-specific path:
	 * - `"claude"` → `.claude/skills/<name>` → `../../.agents/skills/<name>`
	 * - `"codex"` | `"gemini"` → logged as unsupported; skipped gracefully.
	 */
	agent?: "claude" | "codex" | "gemini";
	/**
	 * Skill names from `@theholocron/skills` to install during `holocron repo setup`.
	 * Installed paths are gitignored and managed by setup — do not commit them.
	 *
	 * @example
	 * ["git-safety", "pr-workflow", "commit-standards"]
	 */
	skills?: string[];
	/**
	 * GitHub Pages configuration. When present, `holocron repo setup` calls the
	 * Pages API using `HOLOCRON_DEPLOY_TOKEN` (requires `pages:write` + `repo` scope).
	 * When absent, Pages is left as-is.
	 *
	 * @example
	 * { build: "workflow", domain: "docs.theholocron.dev", https: true }
	 */
	docs?: DocsConfig;
	/**
	 * Environment variable namespace configuration.
	 * Declares the prefix(es) this project uses for its env vars so that
	 * tooling can generate `.env.example`, validate required vars, and
	 * produce accurate documentation without hard-coding prefix strings.
	 *
	 * @example
	 * { namespaces: ["HOLOCRON", "MY_CLI"] }
	 */
	env?: EnvConfig;
	/**
	 * Structured-logging config. Only the level belongs here — Axiom
	 * credentials come from env vars, never a committed file.
	 *
	 * @example
	 * { level: "debug" }
	 */
	log?: LogConfig;
	/**
	 * CLI self-telemetry override layer. Env var (`HOLOCRON_TELEMETRY=false`)
	 * still wins; this is the committed way to opt a repo out or drop usage
	 * analytics while keeping error reporting.
	 *
	 * @example
	 * { enabled: false }
	 * { analytics: "none" }
	 */
	telemetry?: TelemetryConfig;
	/**
	 * ESLint bundle option overrides that Sentinel's centralized static-
	 * analysis check (holocron#849) can't otherwise see. Bucket 1 checks
	 * never read a PR's own committed files for config — this is the
	 * declared source of truth Sentinel reads instead, so its check stays
	 * in sync with what each package's own `eslint.config.ts` already
	 * enforces locally and in CI.
	 */
	eslint?: EslintConfig;
}

/**
 * Repo-root-relative directories treated as browser-targeted for eslint's
 * node-builtins compatibility checks — mirrors
 * `@theholocron/eslint-config`'s `library({ browserPackages })` option.
 * Only needed for a package whose own `eslint.config.ts` already declares
 * `browserPackages` (a deliberate outlier, not the norm — see that
 * package's own config file for why).
 *
 * @example
 * { browserPackages: ["packages/github-client/src/app-auth"] }
 */
export interface EslintConfig {
	/** Repo-root-relative directories treated as browser-targeted. */
	browserPackages?: string[];
}

// ───────────────────────────────────────────────────────────────────────
// Resolved config (what the runtime sees after parsing)
// ───────────────────────────────────────────────────────────────────────

/** A provider with its plugin package resolved. */
export interface ResolvedTuple {
	/** The provider's short name, e.g. `github`. */
	provider: string;
	/** Resolved package name (`@theholocron/holocron-plugin-<provider>` for short refs). */
	packageName: string;
	/** Options passed to the plugin. */
	options: ProviderOptions;
}

/** A capability's resolved entry: one provider, or a list of providers. */
export type ResolvedProviderEntry =
	{ cardinality: "single"; tuple: ResolvedTuple } | { cardinality: "many"; tuples: ResolvedTuple[] };

/** Resolved entries by capability. */
export type ResolvedProvidersConfig = Partial<Record<CapabilityKey, ResolvedProviderEntry>>;

/** A `holocron.config` after `resolveConfig`: defaults applied and provider entries resolved. */
export interface ResolvedHolocronConfig {
	/** Project name. */
	name: string;
	/** A one-line description of the project. */
	description?: string;
	/** Project homepage URL. */
	homepage?: string;
	/** Org name. */
	org?: string;
	/** Org canonical domain. */
	domain?: string;
	/** Repository settings. */
	repo?: RepoConfig;
	/** Which repo-wide checks this repo turns on (`docsCoverage`), validated by `resolveConfig`. */
	repoValidation?: RepoValidationConfig;
	/** The task manifest. */
	tasks?: Array<string | TaskEntryConfig>;
	/** Whether to sync the generated `package.json` scripts. */
	syncScripts?: boolean;
	/** The script used to invoke the `holocron` binary. */
	holocronScript?: string;
	/** Required status checks not backed by a task. */
	extraRequiredChecks?: string[];
	/** Git hooks `holocron repo setup` installs. */
	hooks?: boolean | { prePush?: boolean };
	/** Resolved provider entries by capability. */
	providers: ResolvedProvidersConfig;
	/** Applications in the repo; empty when none are declared. */
	apps: AppConfig[];
	/** Settings for `holocron doctor`; empty when none are declared. */
	doctor: DoctorConfig;
	/** The agent runtime skills are installed for. */
	agent?: "claude" | "codex" | "gemini";
	/** Names of the agent skills to install. */
	skills?: string[];
	/** Resolved Pages config. `build` is guaranteed present when this field exists. */
	docs?: PagesConfig;
	/** Environment-variable settings. */
	env?: EnvConfig;
	/** Logging settings. */
	log?: LogConfig;
	/** Telemetry settings. */
	telemetry?: TelemetryConfig;
	/** ESLint settings. */
	eslint?: EslintConfig;
}
