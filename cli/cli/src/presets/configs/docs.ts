import type { ComposedPreset } from "../../config/compose/index.js";
import { compose } from "../../config/compose/index.js";
import { docs } from "../capabilities/docs.js";
import { node } from "../capabilities/node.js";
import { typecheck } from "../capabilities/typecheck.js";

export type DocsPreset = ComposedPreset;
export type DocsSitePreset = ComposedPreset;

/**
 * Preset for theholocron repos that are TypeScript libraries AND publish a
 * documentation site (e.g. configs, utils, holocron, clients).
 *
 * Includes the "audit / Conclusion" check in `extraRequiredChecks` so branch
 * protection works for repos that add the audit workflow explicitly. The
 * workflow itself is intentionally left repo-specific — add it with your own
 * options:
 *   tasks: [...preset.tasks, { name: "audit", required: true }, ...]
 *   // or with overrides:
 *   tasks: [...preset.tasks, { name: "audit", required: true, with: { "run-knip": true } }, ...]
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
 *   tasks: [...preset.tasks, { name: "audit", required: true }, { name: "release", with: { "run-build": true } }, "sync"],
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
 *   tasks: [...preset.tasks, { name: "release", with: { "run-build": false } }, "sync"],
 *   providers: { ...preset.providers, secrets: "github" },
 * });
 */
export function docsSitePreset(): DocsSitePreset {
	return compose(node(), docs());
}
