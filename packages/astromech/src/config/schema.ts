/**
 * The `tasks` config shape — the single manifest of what a repo runs.
 * Read from a dedicated `astromech.config.*` file or the `tasks` key of
 * `holocron.config.*` (see {@link loadTasksConfig}).
 *
 * Runtime validation is the loader's job, not this type's — the type only
 * describes what an author writes.
 */

export interface TaskEntry {
	/** Registry task name — `test`, `lint`, `build`, `audit`, … */
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
	 * required status check in branch protection (`astro.requiredChecks()`)
	 * and part of `holocron ci`'s default run.
	 */
	required?: boolean;
	/** Per-repo overrides on the same channel the reusable workflow reads. */
	with?: Record<string, unknown>;
	/**
	 * `lint` only — the explicit linter list driving both super-linter's
	 * `VALIDATE_*` env (CI) and the native local run. Omitted → auto-detect
	 * from the config files present.
	 */
	linters?: string[];
	/** Extra `on.push.paths` entries for the generated CI workflow. */
	paths?: string[];
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
	 * a bundle-build check, … Appended to `astro.requiredChecks()` after the
	 * `required`-task contexts. (`DCO` is prepended by `holocron setup` itself.)
	 */
	extraRequiredChecks?: string[];
}

/** Normalise a `TaskConfigItem` to a full {@link TaskEntry} with defaults applied. */
export function normalizeTaskEntry(
	item: TaskConfigItem
): Required<Pick<TaskEntry, "name" | "ci" | "local">> & TaskEntry {
	const entry = typeof item === "string" ? { name: item } : item;
	return { ci: true, local: true, ...entry };
}
