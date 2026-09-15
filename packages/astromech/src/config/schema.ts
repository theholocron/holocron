/**
 * The `tasks` config shape — the single manifest of what a repo runs.
 * Read from a dedicated `astromech.config.*` file or the `tasks` key of
 * `holocron.config.*` (see {@link loadTasksConfig}).
 *
 * Runtime validation is the loader's job, not this type's — the type only
 * describes what an author writes.
 */

export interface TaskEntry {
	/** Registry task name — `verification.unitTests`, `sourceQuality.staticAnalysis`, `delivery.build`, … */
	name: string;
	/**
	 * Emit a `.github/workflows/<name>.yml` thin caller and include the task
	 * in `holocron ci`. Default `true`.
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
	 * and part of `holocron ci`'s default run.
	 */
	required?: boolean;
	/** Per-repo overrides on the same channel the reusable workflow reads. */
	with?: Record<string, unknown>;
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
	 * its own build, e.g. `"node packages/cli/dist/cli.mjs"`.
	 */
	holocronScript?: string;
	/**
	 * Required status-check contexts not backed by a task — codecov gates,
	 * a bundle-build check, … Appended to `astromech.requiredChecks()` after the
	 * `required`-task contexts. (`DCO` is prepended by `holocron setup` itself.)
	 */
	extraRequiredChecks?: string[];
	/**
	 * Git hooks `holocron setup` installs. `true` / `{ prePush: true }` writes
	 * `.husky/pre-push` (runs `holocron ci`); `false` / `{ prePush: false }`
	 * opts out. Omitted → on for `protection: "strict"` repos, off otherwise.
	 * When enabled, `packageScripts()` also emits `prepare: "husky"`.
	 */
	hooks?: boolean | { prePush?: boolean };
}

/** Normalise a `TaskConfigItem` to a full {@link TaskEntry} with defaults applied. */
export function normalizeTaskEntry(
	item: TaskConfigItem
): Required<Pick<TaskEntry, "name" | "ci" | "local">> & TaskEntry {
	const entry = typeof item === "string" ? { name: item } : item;
	return { ci: true, local: true, ...entry };
}
