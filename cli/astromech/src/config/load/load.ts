import { loadLayered } from "@theholocron/datapad";

import { coerceTasks } from "../coerce-tasks/index.js";
import type { TasksConfig } from "../schema/index.js";
import type { LoadTasksConfigOptions, TasksInput } from "./load.type.js";

/**
 * Resolve the task manifest for a repo: the `tasks` key of
 * `holocron.config.*`, then a dedicated `astromech.config.*` merged on
 * top (dedicated wins; item arrays concatenate). Returns `{}` when
 * neither source is present.
 *
 * `walkUp: true` — `holocron run`/`ci` are usable from any subdirectory of
 * a repo, not only its exact root (datapad walks up to the nearest `.git`
 * boundary; see `@theholocron/datapad`'s own doc comment).
 *
 * A caller that has already loaded `holocron.config.*` passes it as
 * `options.holocron` so it is not found and loaded again.
 */
export async function loadTasksConfig(cwd: string, options: LoadTasksConfigOptions = {}): Promise<TasksConfig> {
	const layered = await loadLayered<TasksConfig>({
		cwd,
		name: "astromech",
		walkUp: true,
		fallback: {
			file: "holocron",
			key: "tasks",
			preloaded: options.holocron,
		},
		coerce: (raw) => coerceTasks(raw as TasksInput | undefined),
	});
	return layered?.config ?? {};
}
