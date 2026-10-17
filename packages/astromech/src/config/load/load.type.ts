import type { Loaded } from "@theholocron/datapad";

import type { TaskConfigItem, TasksConfig } from "../schema/index.js";

/**
 * The `tasks` value in each source. A dedicated `astromech.config.*`
 * default-exports the full {@link TasksConfig} object; the `tasks` key of
 * `holocron.config.*` is the bare item array (it mirrors the old
 * `workflows` key). Either form is accepted from either source.
 */
export type TasksInput = TasksConfig | TaskConfigItem[];

export interface LoadTasksConfigOptions {
	/**
	 * The `holocron.config.*` the caller has already loaded (`null`: it looked and
	 * there is none), so it isn't found and loaded a second time. Leave it unset
	 * to have `loadTasksConfig` find it itself.
	 */
	holocron?: Loaded<object> | null;
}
