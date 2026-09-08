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
	 * The task's CI check context is a required status check (branch
	 * protection) and part of `holocron ci`'s default run.
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
	 * Required status-check contexts not backed by a task — DCO, semantic
	 * PR title, …
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
