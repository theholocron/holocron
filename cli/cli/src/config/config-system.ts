/**
 * Holocron's config system: `defineConfig`, `loadConfig` and `compose`, all built from one
 * `createConfigSystem` call.
 *
 * File discovery, the walk up to `.git`, module loading (typed configs via `tsx`) and the derive-then-resolve flow come
 * from `@theholocron/kyber/config`. The holocron-specific parts are `deriveDefaults` (name, `repo.name`, the task
 * manifest), `placeAreas` (the `.holocron/` area files, placed before `deriveDefaults`), `resolveConfig` and `mergeStrategies`.
 *
 * The three functions live together because each is only a method of the one system object; splitting them back into
 * one file apiece would just be pass-through wrappers (an exception to the one-function-per-file rule).
 *
 * Probe order is TS-first (`.ts` → `.js` → `.mjs` → `.cjs` → `.json`) —
 * see ADR-0010 / issue #75 / #81.
 */

import { createConfigSystem } from "@theholocron/kyber/config";

import type { Capability, ComposedPreset } from "./compose/compose.type.js";
import { mergeStrategies } from "./compose/merge-strategies/index.js";
import { type HolocronConfig, resolveConfig, type ResolvedHolocronConfig } from "./config/index.js";
import type { LoadedConfig } from "./config-system.type.js";
import { deriveDefaults } from "./load-config/derive-defaults/index.js";
import { HOLOCRON_AREAS, SHARED_AREAS } from "./load-config/holocron-areas/index.js";
import { placeAreas } from "./load-config/place-areas/index.js";
import { resolveLayers, type ResolveLayersInput } from "./resolve-layers/index.js";

export type { LoadedConfig } from "./config-system.type.js";
export { ConfigFileError } from "@theholocron/kyber/config";

const system = createConfigSystem<HolocronConfig, ResolvedHolocronConfig, Capability, ComposedPreset>({
	name: "holocron",
	areas: HOLOCRON_AREAS,
	shared: SHARED_AREAS,
	place: placeAreas,
	derive: deriveDefaults,
	resolve: resolveConfig,
	merge: mergeStrategies,
});

/** Returns the config unchanged; it exists to type and autocomplete a `holocron.config.ts`. */
export const defineConfig: (config: HolocronConfig) => HolocronConfig = system.defineConfig;

/**
 * Read + parse + resolve `holocron.config.*` starting from the given
 * directory, walking up through ancestors to the nearest `.git` boundary
 * when `cwd` itself has no match — every command is usable from any
 * subdirectory of a repo, not only its exact root (see
 * `@theholocron/datapad`'s own doc comment for the stop conditions).
 * Throws `ConfigFileError` when nothing is found or a file cannot
 * be loaded, or `ConfigError` when the config fails schema checks.
 *
 * Every `layer` an entry names becomes the `environment` it stands for (`resolveLayers()`, spec
 * `tech-environment-layers`, #2069), read from the `origin` remote at `cwd`; `input` lets a test pass a fake remote.
 */
export async function loadConfig(cwd: string, input: Omit<ResolveLayersInput, "repoRoot"> = {}): Promise<LoadedConfig> {
	const loaded = await system.loadConfig(cwd);
	return { ...loaded, resolved: await resolveLayers(loaded.resolved, { repoRoot: cwd, ...input }) };
}

/**
 * Merge any number of capability fragments into a single preset object that
 * spreads directly into `defineConfig()`.
 *
 * - Accepts individual capabilities or nested arrays (for bundle presets).
 * - Deduplicates by `id` — when the same ID appears more than once, the last
 *   occurrence wins. This lets callers override bundle defaults by listing an
 *   explicit capability after the bundle.
 * - Validates all `requires` at call time and throws `ConfigError` if any are
 *   unmet, listing every missing dependency in a single message.
 *
 * @example
 * // docs-only site — no typecheck
 * const preset = compose(node(), docs());
 *
 * // library with docs
 * const preset = compose(node(), typecheck(), docs());
 *
 * // nextjs() is a bundle that returns Capability[]
 * const preset = compose(node(), nextjs());
 */
export const compose: (...args: (Capability | Capability[])[]) => ComposedPreset = system.compose;
