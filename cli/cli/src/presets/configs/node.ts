import type { ComposedPreset } from "../../config/compose/index.js";
import { compose } from "../../config/compose/index.js";
import { node as nodeCapability } from "../capabilities/node.js";

/**
 * Base preset for theholocron Node.js repositories.
 * Spread the returned fragments into `defineConfig()`.
 *
 * @example
 * const preset = node();
 * export default defineConfig({
 *   ...preset,
 *   repo: { ...preset.repo, name: "theholocron/my-lib" },
 *   tasks: [...preset.tasks, { name: "release", with: { "run-build": true } }],
 * });
 */
export function nodePreset(): ComposedPreset {
	return compose(nodeCapability());
}
