import type { ComposedPreset } from "../../config/compose/index.js";
import { compose } from "../../config/compose/index.js";
import { nextjs as nextjsCapability } from "../capabilities/nextjs.js";
import { node } from "../capabilities/node.js";
import { typecheck } from "../capabilities/typecheck.js";

/**
 * Preset for single-package Next.js application repos. Includes Vercel
 * deployment, Lighthouse audit, Storybook + interaction + user-flow tests,
 * and the derived Conclusion checks.
 *
 * @example
 * const preset = nextjs({ test: { "wait-on-url": "http://localhost:3000", "run-chromatic": true } });
 * export default defineConfig({
 *   ...preset,
 *   repo: { ...preset.repo, name: "theholocron/my-app", topics: ["nextjs"] },
 *   tasks: [
 *     ...preset.tasks,
 *     "sync",
 *     { name: "deploy", with: { docs: true, storybook: [{ name: "" }] } },
 *   ],
 * });
 */
export function nextjsPreset(options?: import("../capabilities/nextjs.js").NextjsOptions): ComposedPreset {
	return compose(node(), typecheck(), ...nextjsCapability(options));
}
