export interface TaskEntry {
	/** Registry task name — `verification.unitTests`, `sourceQuality.staticAnalysis`, `delivery.build`, … */
	name: string;
	/**
	 * Emit a `.github/workflows/<name>.yml` thin caller and include the task
	 * in `holocron run ci`. Default `true`.
	 */
	ci?: boolean;
	/**
	 * Write a `"<name>": "holocron run <name>"` script to `package.json` and
	 * let `holocron run <name>` resolve the task. Default `true`.
	 * `false` → `holocron run <name>` prints "CI-only task" and exits 0.
	 */
	local?: boolean;
	/**
	 * The task's CI check context (from `WORKFLOW_CHECK_CONTEXTS`) is a
	 * required status check in branch protection (`astromech.requiredChecks()`)
	 * and part of `holocron run ci`'s default run.
	 */
	required?: boolean;
	/** Per-repo overrides on the same channel the reusable workflow reads. */
	with?: Record<string, unknown>;
	/**
	 * Switch individual sub-jobs of a task off for this repo (`false`), by their registry key or alias:
	 * `{ name: "platform.repoValidation", jobs: { docsEnforcement: false } }`. A job left out runs. The job's CI
	 * check still reports (green, "off in this repo's config"), so a required check never goes missing.
	 */
	jobs?: Record<string, boolean>;
	/** Extra `on.push.paths` entries for the generated CI workflow. */
	paths?: string[];
	/**
	 * Per-repo additions to this task's generated `turbo.json` entry — a
	 * separate channel from `with:` (that's the reusable *workflow's* inputs;
	 * this is local turbo cache config, unrelated). No-op for a task with no
	 * {@link TurboTaskConfig} in the registry (nothing to add to).
	 */
	turbo?: {
		/** Extra env vars turbo hashes into this task's cache key, appended to the registry default (empty when the task has none). */
		passThroughEnv?: string[];
		/**
		 * Extra input globs appended to the registry default's `inputs`
		 * (holocron#845) — for a package whose layout the registry's
		 * `"src/**"` default doesn't cover (e.g. a flat-layout package with
		 * no `src/` directory at all). Appended, not replaced: the
		 * registry's other inputs (`package.json`, `tsdown.config.ts`, …)
		 * stay tracked without needing to be repeated here.
		 */
		inputs?: string[];
		/**
		 * Extra tasks this one waits for, appended to the registry default's
		 * `dependsOn` — for a build the package does not list as a dependency
		 * but its task loads anyway (e.g. `staticAnalysis` loading the root
		 * ESLint config, which imports a package of the workspace). Turbo
		 * syntax: `"<package>#<task>"`, `"^<task>"`.
		 */
		dependsOn?: string[];
	};
}

/** A task is either its bare name (all defaults) or an entry object. */
export type TaskConfigItem = string | TaskEntry;

export interface TasksConfig {
	/** The manifest. */
	tasks?: TaskConfigItem[];
	/** Opt out of the `package.json` script writes. Default `true`. */
	syncScripts?: boolean;
	/**
	 * The command the synced `"holocron"` `package.json` script runs. Default
	 * `"holocron"` (the installed bin). The source repo overrides it to run
	 * its own build, e.g. `"node cli/cli/dist/cli.mjs"`.
	 */
	holocronScript?: string;
	/**
	 * Required status-check contexts not backed by a task — codecov gates,
	 * a bundle-build check, … Appended to `astromech.requiredChecks()` after the
	 * `required`-task contexts. (`DCO` is prepended by `holocron repo setup` itself.)
	 */
	extraRequiredChecks?: string[];
	/**
	 * Git hooks `holocron repo setup` installs. `true` / `{ prePush: true }` writes
	 * `.husky/pre-push` (runs `holocron run ci`); `false` / `{ prePush: false }`
	 * opts out. Omitted → on for `protection: "strict"` repos, off otherwise.
	 * When enabled, `packageScripts()` also emits `prepare: "husky"`.
	 */
	hooks?: boolean | { prePush?: boolean };
}
