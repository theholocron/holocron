import type { ComposedPreset } from "../../config/compose/index.js";
import { compose } from "../../config/compose/index.js";
import { node } from "../capabilities/node.js";
import type { ReactOptions } from "../capabilities/react.js";
import { react as reactCapability } from "../capabilities/react.js";
import { typecheck } from "../capabilities/typecheck.js";

export type { ReactOptions };

/**
 * Preset for single-package React/Vite application repos. Includes Storybook,
 * interaction tests, Knip + Lighthouse audit, and the UI extraRequiredChecks.
 *
 * Pass `test` overrides to merge repo-specific options (e.g. run-chromatic)
 * into the single test workflow entry so the sync tool sees one complete entry:
 *
 * @example
 * const preset = react({
 *   test: { "run-chromatic": { projects: [{ tokenName: "default", workingDir: "." }] } },
 * });
 * export default defineConfig({
 *   ...preset,
 *   repo: { ...preset.repo, name: "theholocron/my-app" },
 *   tasks: [...preset.tasks, "sync", { name: "deploy", with: { docs: true, storybook: [{ name: "" }] } }],
 * });
 */
export function reactPreset(options?: ReactOptions): ComposedPreset {
	return compose(node(), typecheck(), reactCapability(options));
}
