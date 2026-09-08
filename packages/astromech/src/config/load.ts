import { loadConfigFile, mergeConfig } from "@theholocron/datapad";

import type { TaskConfigItem, TasksConfig } from "./schema.js";

/**
 * The `tasks` value in each source. A dedicated `astromech.config.*`
 * default-exports the full {@link TasksConfig} object; the `tasks` key of
 * `holocron.config.*` is the bare item array (it mirrors the old
 * `workflows` key). Either form is accepted from either source.
 */
type TasksInput = TasksConfig | TaskConfigItem[];

/**
 * Resolve the task manifest for a repo: the `tasks` key of
 * `holocron.config.*`, then a dedicated `astromech.config.*` merged on
 * top (dedicated wins; item arrays concatenate). Returns `{}` when
 * neither source is present.
 */
export async function loadTasksConfig(cwd: string): Promise<TasksConfig> {
	const dedicated = await loadConfigFile<TasksInput>({ cwd, name: "astromech" });
	const parent = await loadConfigFile<{ tasks?: TasksInput }>({ cwd, name: "holocron" });

	return [coerce(parent?.config.tasks), coerce(dedicated?.config)]
		.filter((layer): layer is TasksConfig => layer !== undefined)
		.reduce<TasksConfig>((acc, layer) => mergeConfig(acc, layer), {});
}

function coerce(value: TasksInput | undefined): TasksConfig | undefined {
	if (value == null) return undefined;
	return Array.isArray(value) ? { tasks: value } : value;
}
