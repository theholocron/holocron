/**
 * `@theholocron/datapad` — generic config-file loading for Holocron.
 *
 * A datapad reads and holds data; this reads and holds config files.
 * Discover `<name>.config.{ts,js,mjs,cjs,json}`, load it (typed configs
 * via `tsx`, no build step), layer a dedicated file over a key of a
 * parent file, deep-merge, and hand back a plain object. No schema, no
 * validation, no defaults — the consumer owns those.
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

export { createDefineConfig } from "./define.js";
export { ConfigFileError } from "./errors.js";
export {
	DEFAULT_EXTENSIONS,
	type LayeredResult,
	loadConfigFile,
	type LoadConfigFileOptions,
	type Loaded,
	loadLayered,
	type LoadLayeredOptions,
} from "./load.js";
export { mergeConfig } from "./merge.js";
