/**
 * `holocron.config.{ts,js,mjs,cjs,json}` loader.
 *
 * File discovery, the walk up to `.git`, module loading (typed configs via `tsx`) and the derive-then-resolve flow come
 * from `@theholocron/kyber/config`. The holocron-specific parts are `deriveDefaults` (name, `repo.name`, the task
 * manifest) and `resolveConfig`; see `../system`.
 *
 * Probe order is TS-first (`.ts` → `.js` → `.mjs` → `.cjs` → `.json`) —
 * see ADR-0010 / issue #75 / #81.
 */

import { system } from "../system/index.js";
import type { LoadedConfig } from "./load-config.type.js";

export { ConfigFileError } from "@theholocron/kyber/config";

/**
 * Read + parse + resolve `holocron.config.*` starting from the given
 * directory, walking up through ancestors to the nearest `.git` boundary
 * when `cwd` itself has no match — every command is usable from any
 * subdirectory of a repo, not only its exact root (see
 * `@theholocron/datapad`'s own doc comment for the stop conditions).
 * Throws `ConfigFileError` when nothing is found or a file cannot
 * be loaded, or `ConfigError` when the config fails schema checks.
 */
export function loadConfig(cwd: string): Promise<LoadedConfig> {
	return system.loadConfig(cwd);
}
