import { loadConfigFile, mergeConfig } from "@theholocron/datapad";

import type { TasksInput } from "./load.type.js";
import type { TasksConfig } from "./schema.type.js";

/**
 * Resolve the task manifest for a repo: the `tasks` key of
 * `holocron.config.*`, then a dedicated `astromech.config.*` merged on
 * top (dedicated wins; item arrays concatenate). Returns `{}` when
 * neither source is present.
 *
 * `walkUp: true` — `holocron run`/`ci` are usable from any subdirectory of
 * a repo, not only its exact root (datapad walks up to the nearest `.git`
 * boundary; see `@theholocron/datapad`'s own doc comment).
 */
export async function loadTasksConfig(cwd: string): Promise<TasksConfig> {
	const dedicated = await loadConfigFile<TasksInput>({ cwd, name: "astromech", walkUp: true });
	const parent = await loadConfigFile<{ tasks?: TasksInput }>({ cwd, name: "holocron", walkUp: true });

	return mergeTasksLayers(parent?.config.tasks, dedicated?.config);
}

/**
 * The merge step of {@link loadTasksConfig}, for callers that load the two
 * sources some other way (Sentinel reads them from the GitHub API, not
 * from disk, holocron#916): `holocron.config.*`'s `tasks` value first,
 * then a dedicated `astromech.config.*`'s default export merged on top.
 * Either may be `undefined` (source absent); returns `{}` when both are.
 */
export function mergeTasksLayers(parentTasks: TasksInput | undefined, dedicated: TasksInput | undefined): TasksConfig {
	return [coerce(parentTasks), coerce(dedicated)]
		.filter((layer): layer is TasksConfig => layer !== undefined)
		.reduce<TasksConfig>((acc, layer) => mergeConfig(acc, layer), {});
}

function coerce(value: TasksInput | undefined): TasksConfig | undefined {
	if (value == null) return undefined;
	return Array.isArray(value) ? { tasks: value } : value;
}
