import { createDefineConfig } from "@theholocron/datapad";

import type { TasksConfig } from "./schema.js";

/**
 * Typed identity helper for `astromech.config.ts`:
 *
 * ```ts
 * import { defineConfig } from "@theholocron/astromech/config";
 *
 * export default defineConfig({
 *   tasks: ["typecheck", { name: "test", required: true }],
 * });
 * ```
 */
export const defineConfig = createDefineConfig<TasksConfig>();
