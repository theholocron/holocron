import { loadConfigFile } from "@theholocron/datapad";

import type { TasksInput } from "./load.type.js";
import { mergeTasksLayers } from "./merge-tasks-layers.js";
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
