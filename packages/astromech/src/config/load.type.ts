import type { TaskConfigItem, TasksConfig } from "./schema.type.js";

/**
 * The `tasks` value in each source. A dedicated `astromech.config.*`
 * default-exports the full {@link TasksConfig} object; the `tasks` key of
 * `holocron.config.*` is the bare item array (it mirrors the old
 * `workflows` key). Either form is accepted from either source.
 */
export type TasksInput = TasksConfig | TaskConfigItem[];
