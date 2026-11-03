import { normalizeTaskEntry, type TasksConfig } from "../../config/schema/index.js";
import { legacyName } from "../../vocabulary/legacy-name/index.js";
import type { LegacyTarget } from "../../vocabulary/legacy-names/index.js";
import { resolveTaskName } from "../../vocabulary/resolve-task-name/index.js";

/**
 * The configured tasks that were under an old intent-group namespace (`sourceQuality` matches the tasks that were
 * `sourceQuality.*`), as flat ids in manifest declaration order. The old group names are accepted for the window that
 * the old dotted names are, and a new-style `tasks:` entry matches through the old name its id replaced.
 */
export function matchNamespace(config: TasksConfig, namespace: string): LegacyTarget[] {
	const prefix = `${namespace}.`;
	return (config.tasks ?? []).map(normalizeTaskEntry).reduce<LegacyTarget[]>((found, entry) => {
		for (const target of resolveTaskName(entry.name)) {
			if (legacyName(target.id)?.startsWith(prefix) && !found.some((t) => t.id === target.id)) found.push(target);
		}
		return found;
	}, []);
}
