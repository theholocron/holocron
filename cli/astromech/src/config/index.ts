/**
 * `@theholocron/astromech/config` — the config surface, kept in a
 * zero-runtime-dep entry so `astromech.config.ts` and `@theholocron/cli`
 * can import it without pulling the task runner.
 */

export { defineConfig } from "./define/index.js";
export { loadTasksConfig } from "./load/index.js";
export { mergeTasksLayers } from "./merge-tasks-layers/index.js";
export type { TaskConfigItem, TaskEntry, TasksConfig } from "./schema/index.js";
export { normalizeTaskEntry } from "./schema/index.js";
