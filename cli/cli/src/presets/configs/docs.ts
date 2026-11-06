import type { ComposedPreset } from "../../config/compose/index.js";
import { compose } from "../../config/config-system.js";
import { docs } from "../capabilities/docs.js";
import { node } from "../capabilities/node.js";
import { typecheck } from "../capabilities/typecheck.js";

/** A composed preset for a TypeScript library that also publishes a documentation site. */
export type DocsPreset = ComposedPreset;
/** A composed preset for a documentation-only site with no TypeScript source. */
export type DocsSitePreset = ComposedPreset;

/**
 * Preset for theholocron repos that are TypeScript libraries AND publish a
 * documentation site (e.g. configs, utils, holocron, clients).
 *
 * Includes the "audit / Conclusion" check in `extraRequiredChecks` so branch
 * protection works for repos that add the audit workflow explicitly. The
 * tasks are intentionally left repo-specific — add the ones you want as flat ids:
 *   tasks: [...preset.tasks, { name: "measure-bundle", required: true }, "lint:unused", ...]
 *
 * For docs-only sites without TypeScript source, use docsSitePreset() instead.
 *
 * @example
 * const preset = docsPreset();
 * export default defineConfig({
 *   ...preset,
 *   description: "...",
 *   homepage: "https://docs.theholocron.dev/my-lib/",
 *   repo: { ...preset.repo, name: "theholocron/my-lib", topics: ["typescript"] },
 *   tasks: [...preset.tasks, { name: "measure-bundle", required: true }, { name: "release", with: { "run-build": true } }, "sync-repo"],
 *   providers: { ...preset.providers, secrets: "github" },
 * });
 */
export function docsPreset(): DocsPreset {
	return compose(
		node(),
		typecheck(),
		docs(),
		// `audit / Conclusion` required for every docs repo — the audit
		// workflow is added per-repo (with repo-specific options), so this is an
		// extra check rather than a `{ required: true }` task.
		{ id: "audit-check", requires: ["node"], extraRequiredChecks: ["audit / Conclusion"] }
	);
}

/**
 * Preset for theholocron repos that are documentation-only sites with no
 * TypeScript source to check (e.g. skills, themes). No typecheck, no audit.
 *
 * @example
 * const preset = docsSitePreset();
 * export default defineConfig({
 *   ...preset,
 *   description: "...",
 *   repo: { ...preset.repo, name: "theholocron/my-site" },
 *   tasks: [...preset.tasks, { name: "release", with: { "run-build": false } }, "sync-repo"],
 *   providers: { ...preset.providers, secrets: "github" },
 * });
 */
export function docsSitePreset(): DocsSitePreset {
	return compose(node(), docs());
}
