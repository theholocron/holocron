import { system } from "../system/index.js";
import type { Capability, ComposedPreset } from "./compose.type.js";

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
export function compose(...args: (Capability | Capability[])[]): ComposedPreset {
	return system.compose(...args);
}
