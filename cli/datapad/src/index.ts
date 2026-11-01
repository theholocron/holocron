/**
 * `@theholocron/datapad` — generic config-file loading for Holocron.
 *
 * A datapad reads and holds data; this reads and holds config files.
 * Discover `<name>.config.{ts,js,mjs,cjs,json}`, load it (typed configs
 * via `tsx`, no build step), layer a dedicated file over a key of a
 * parent file, deep-merge, and hand back a plain object. No schema, no
 * validation, no defaults — the consumer owns those. `readConfigSource` +
 * `loadConfigFromContent` cover the same loading for content that didn't come
 * from a file on disk (a network fetch, a git blob, …), and
 * `withConfigSandbox` prepares the directory that needs.
 *
 * Probe order is **TS-first**: `.ts` → `.js` → `.mjs` → `.cjs` → `.json`
 * (ADR-0010). `walkUp` adds the "nearest config" search (see
 * `loadConfigFile`).
 *
 * ```ts
 * import { loadConfigFile, loadLayered, mergeConfig, createDefineConfig } from "@theholocron/datapad";
 *
 * const found = await loadConfigFile<HolocronConfig>({ cwd, name: "holocron" });
 * const layered = await loadLayered<TasksConfig>({
 *   cwd,
 *   name: "astromech",
 *   fallback: { file: "holocron", key: "tasks" },
 * });
 * ```
 */

export { DEFAULT_EXTENSIONS } from "./default-extensions/index.js";
export { createDefineConfig } from "./define/index.js";
export { ConfigFileError } from "./errors/index.js";
export type { LoadConfigFileOptions, Loaded } from "./load-config-file/index.js";
export { loadConfigFile } from "./load-config-file/index.js";
export type { LoadConfigFromContentOptions } from "./load-config-from-content/index.js";
export { loadConfigFromContent } from "./load-config-from-content/index.js";
export type { LayeredResult, LoadLayeredOptions } from "./load-layered/index.js";
export { loadLayered } from "./load-layered/index.js";
export { mergeLayers } from "./merge-layers/index.js";
export type { ConfigSource, ReadConfigSourceOptions } from "./read-config-source/index.js";
export { readConfigSource } from "./read-config-source/index.js";
export type { ConfigSandboxOptions } from "./with-config-sandbox/index.js";
export { withConfigSandbox } from "./with-config-sandbox/index.js";
/** Deep-merges config objects; the datapad name for `deepMerge` from `@theholocron/object-utils`. */
export { deepMerge as mergeConfig } from "@theholocron/object-utils";
