import type { TasksConfig } from "./config/schema/index.js";
import type {
	CodecovConfigOptions,
	EnsureRootWorkspaceMemberResult,
	EnsureTurboDependencyResult,
	OrgContext,
} from "./generators/index.js";
import type { CiOptions, CiReport, ExecFn, GroupReport, RunLogger, RunTaskReport } from "./tasks/index.js";

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
	/** Injectable subprocess runner (tests). Defaults to `spawnSync` (stdio inherit). */
	exec?: ExecFn;
	/** Injectable fs (tests). Default to `node:fs`. */
	readFile?: (path: string) => string;
	fileExists?: (path: string) => boolean;
	listDir?: (path: string) => string[];
	/** Injectable environment for `--affected` (tests). Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** Injectable binary lookup (tests). Default checks `node_modules/.bin` then `PATH`. */
	lookPath?: (cwd: string, bin: string) => string | null;
}

export interface RunOptions {
	/**
	 * Sub-job within the task — `performance` in `holocron run audit
	 * performance`. Only meaningful for tasks that declare `jobs` (`audit`);
	 * ignored otherwise. Omit to run every job the task has.
	 */
	job?: string;
	/** Args after `--`, forwarded to the tool / turbo / script. */
	passthrough?: string[];
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

export interface Astromech {
	/**
	 * Run one task — or one of its sub-jobs (`opts.job`) — locally. When
	 * `task` isn't an exact registry task but matches the prefix of one or
	 * more configured tasks (`"sourceQuality"` against `sourceQuality.*`),
	 * runs every matching task in sequence instead ({@link GroupReport}) —
	 * `opts.job` is ignored for a namespace match, since a job belongs to
	 * one task, not a namespace.
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
	 * `package.json` scripts for this repo's manifest — the `"holocron"` entry
	 * (`config.holocronScript ?? "holocron"`) plus `"<task>": "holocron run
	 * <task>"` for every `config.tasks` item that is a runnable registry task
	 * and not `local: false`. Merge into `package.json`; never clobber. Empty
	 * when there is no config or `syncScripts: false`.
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
	 * The branch-protection required-status-check contexts for this repo —
	 * every `required: true` task's check context plus `extraRequiredChecks`,
	 * ordered and de-duplicated. `holocron repo setup` prepends `"DCO"` and applies
	 * the list; this method is policy-free (manifest only).
	 */
	requiredChecks(): string[];
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
	 * write directly, no merge. `null` when no manifest task has turbo fan-out
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
