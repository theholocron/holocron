/**
 * `@theholocron/astromech/config` — the config surface, kept in a
 * zero-runtime-dep entry so `astromech.config.ts` and `@theholocron/cli`
 * can import it without pulling the task runner.
 */

export { defineConfig } from "./define.js";
export { loadTasksConfig } from "./load.js";
export { mergeTasksLayers } from "./merge-tasks-layers.js";
export { normalizeTaskEntry } from "./schema.js";
export type { TaskConfigItem, TaskEntry, TasksConfig } from "./schema.type.js";
