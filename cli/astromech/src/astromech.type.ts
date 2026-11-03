import type { TasksConfig } from "./config/schema/index.js";
import type {
	CodecovConfigOptions,
	EnsureRootWorkspaceMemberResult,
	EnsureTurboDependencyResult,
	OrgContext,
} from "./generators/index.js";
import type { CiOptions, CiReport, ExecFn, GroupReport, RunLogger, RunTaskReport } from "./tasks/index.js";

/** Everything `createAstromech` needs from the repo and the outside world; only `cwd` is required. */
export interface AstromechOptions {
	/** Repo root. */
	cwd: string;
	/**
	 * The resolved task manifest. Optional for `run` (which is
	 * filesystem-driven); `thinCallers` / `packageScripts` / `ci` need it.
	 * Load it with `loadTasksConfig` from `@theholocron/astromech/config`.
	 */
	config?: TasksConfig;
	/**
	 * Org context for the `deploy` workflow's `preview:` shorthand — used to
	 * derive the Cloudflare Pages project / domain when they are not spelt out.
	 */
	orgContext?: OrgContext;
	/** Structured-logging sink. Defaults to a no-op. */
	logger?: RunLogger;
	/** User-facing line printer. Defaults to `console.log`. */
	print?: (line: string) => void;
	/** Where a deprecation notice goes (an old task name, a group name). Defaults to `console.error`, so it is on stderr. */
	warn?: (line: string) => void;
	/** Injectable subprocess runner (tests). Defaults to `spawnSync` (stdio inherit). */
	exec?: ExecFn;
	/** Injectable fs (tests). Default to `node:fs`. */
	readFile?: (path: string) => string;
	/** Injectable existence check (tests). Defaults to `node:fs`. */
	fileExists?: (path: string) => boolean;
	/** Injectable directory listing (tests). Defaults to `node:fs`. */
	listDir?: (path: string) => string[];
	/** Injectable environment for `--affected` (tests). Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** Injectable binary lookup (tests). Default checks `node_modules/.bin` then `PATH`. */
	lookPath?: (cwd: string, bin: string) => string | null;
}

/** Options for `Astromech.run`: which word follows the task, what to forward, and how to scope the turbo run. */
export interface RunOptions {
	/**
	 * The word after `task`, part of the task's name when the two together name a leaf (`unit` in `holocron run test
	 * unit`), else forwarded to the task as an argument.
	 */
	job?: string;
	/**
	 * Further positional words after `task` and `job`. All the words together name the task: `holocron run test unit
	 * storybook` is `task: "test"`, `job: "unit"`, `args: ["storybook"]`, and the longest match against the registry
	 * (`test:unit`) leaves `storybook` as an argument for the task.
	 */
	args?: string[];
	/** Args after `--`, forwarded to the tool / turbo / script. */
	passthrough?: string[];
	/** The read-only form of a task that writes by default: `format --check` runs prettier without writing. */
	check?: boolean;
	/** Print the resolved command without running it. */
	dryRun?: boolean;
	/** Fail (exit 1) instead of skipping when the repo has no such task. */
	required?: boolean;
	/** `turbo --filter=<pkg>` passthrough (monorepo). */
	filter?: string;
	/** `turbo --affected`: only the packages changed since `base`. */
	affected?: boolean;
	/** Git ref `affected` compares against. */
	base?: string;
}

/** The task runner: one manifest drives local runs, the CI pre-flight and the generated workflows and scripts. */
export interface Astromech {
	/**
	 * Run a task, a suite or an old name locally. The words (`task`, `opts.job`, `opts.args`) are joined with `:` and the
	 * longest match against the registry wins: `test:unit` and `test unit` are one leaf, `test` is the suite (every
	 * configured leaf, in registry order, as a {@link GroupReport}), and what is left over is forwarded to the
	 * task. An old dotted name (`verification.unitTests`) still works and prints a deprecation notice; one that
	 * stood for several tasks (`sourceQuality.formatting`) or an old group name (`"sourceQuality"`) runs each in
	 * sequence as a {@link GroupReport}.
	 */
	run(task: string, opts?: RunOptions): RunTaskReport | GroupReport;
	/**
	 * Run the merge-gating checks locally, in CI order — "will CI pass?".
	 * Default scope: `required: true` tasks (falls back to every `ci: true`
	 * task when nothing is marked required). Exit non-zero on any failure.
	 */
	ci(opts?: CiOptions): CiReport;
	/**
	 * The `.github/workflows/*.yml` thin callers for this repo's manifest —
	 * `filename` → YAML content (no generated-by header; the caller adds it).
	 * One entry per `config.tasks` item that has a workflow template and is
	 * not `ci: false`.
	 */
	thinCallers(): Map<string, string>;
	/**
	 * The complete reusable-workflow batch `holocron sync github` pushes to
	 * `theholocron/.github` — repo-relative path → content, "do not edit" header
	 * already applied to the YAML. Config-independent (the same for every repo).
	 */
	reusableTemplates(): Map<string, string>;
	/**
	 * `package.json` scripts for this repo's manifest, from `scriptsFor()`: the `"holocron"` entry
	 * (`config.holocronScript ?? "holocron"`), `prepare` when hooks are on, and one script per task the repo can run
	 * locally. In a pnpm workspace with a generated `turbo.json` those call `turbo run <key>` (a suite is a turbo task
	 * of its own) or, for a repo-scoped leaf, hold the tool's command; in a single package they are `holocron run
	 * <words> --`. Merge into `package.json` with `mergeScripts()`; never clobber. Empty when there is no config or
	 * `syncScripts: false`.
	 */
	packageScripts(): Record<string, string>;
	/**
	 * Task names this repo's manifest can actually run locally — the same
	 * filter {@link packageScripts} applies (skips `local: false` and tasks
	 * with no local runner at all), but independent of `syncScripts`: a repo
	 * that opts out of generated `package.json` scripts still has real
	 * runnable tasks. Empty when there is no config. Backs `holocron`'s own
	 * interactive task picker (`run` with no task given).
	 */
	runnableTasks(): string[];
	/**
	 * The branch-protection required-status-check contexts for this repo. With `aggregate` (the repo hosts the `ci`
	 * check, see {@link aggregateCaller}) they are `ci / Required checks` and `DCO`; without it, `DCO`, every `required: true` task's
	 * check context and `extraRequiredChecks`, ordered and de-duplicated. `holocron repo setup` applies the list; this
	 * method is policy-free (manifest only).
	 */
	requiredChecks(aggregate: boolean): string[];
	/**
	 * The thin caller of the `ci` aggregate check (a `pull_request` workflow whose job `ci` calls the `Required checks` job that waits on every
	 * `required: true` task, the hand-written checks and the `codecov/*` statuses), or `null` when the manifest has
	 * nothing to wait on. Only a repo that hosts the reusable `ci.yml` writes it; the others have no `ci` yet.
	 */
	aggregateCaller(): string | null;
	/**
	 * This repo's `codecov.yml` — component `paths` derived from the workspace packages.
	 * Pass the current file's content (`null` if none exists yet) to either
	 * merge the component list in or scaffold a fresh file. Policy-free same
	 * as {@link requiredChecks} — `holocron repo setup` owns writing the result.
	 * `options.docsCoverage` adds the `documentation` flag and its statuses.
	 */
	codecovConfig(existing: string | null, options?: CodecovConfigOptions): string;
	/**
	 * The generated `turbo.json` for this repo's manifest, pretty-printed —
	 * write directly, no merge. In a pnpm workspace it also holds the suite aggregator tasks and a `//#<id>` root task
	 * per repo-scoped leaf with a local tool. `null` when no manifest task has turbo fan-out
	 * config (nothing to write). See {@link TurboTaskConfig} in `registry.ts`.
	 */
	turboConfig(): string | null;
	/**
	 * Fixes #692: whenever {@link turboConfig} isn't `null`, this repo's root
	 * package needs to actually be a workspace member for the tasks it fans
	 * out — otherwise a root that's genuinely a directly-buildable package
	 * (not just an orchestrator) silently vanishes from `turbo run <task>`.
	 * Pass `pnpm-workspace.yaml`'s current content (or `""` if none exists —
	 * a no-op either way, since no `packages:` key means single-package mode
	 * already) and root `package.json`'s own `scripts` object — values and
	 * all, not just keys, so a task-name-matching script that's already the
	 * generated `holocron run <task> --` wrapper (predating this call, not
	 * written by it) is correctly excluded rather than treated as proof root
	 * is directly buildable (#846). `changed: false` means don't write
	 * anything — the file is already correct.
	 */
	ensureRootWorkspaceMember(
		workspaceYaml: string,
		rootScripts: Readonly<Record<string, string>>
	): EnsureRootWorkspaceMemberResult;
	/**
	 * `turboConfig()` writes a `turbo.json` but never touches `package.json`
	 * — a repo with no local `turbo` devDependency falls back to whatever
	 * (if anything) is globally on `PATH`, per `run.ts`'s `resolveBin()`.
	 * Pass root `package.json`'s raw content and `pnpm-workspace.yaml`'s
	 * current content (checked for an existing `turbo` catalog entry, which
	 * takes precedence over the hardcoded fallback version). `changed: false`
	 * means don't write anything — `devDependencies.turbo` already exists.
	 */
	ensureTurboDependency(packageJson: string, workspaceYaml: string): EnsureTurboDependencyResult;
}
