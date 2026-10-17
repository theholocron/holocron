import type { TaskConfigItem, TaskEntry } from "./schema.type.js";
/**
 * The `tasks` config shape — the single manifest of what a repo runs.
 * Read from a dedicated `astromech.config.*` file or the `tasks` key of
 * `holocron.config.*` (see {@link loadTasksConfig}).
 *
 * Runtime validation is the loader's job, not this type's — the type only
 * describes what an author writes.
 */

/** Normalise a `TaskConfigItem` to a full {@link TaskEntry} with defaults applied. */
export function normalizeTaskEntry(
	item: TaskConfigItem
): Required<Pick<TaskEntry, "name" | "ci" | "local">> & TaskEntry {
	const entry = typeof item === "string" ? { name: item } : item;
	return { ci: true, local: true, ...entry };
}
