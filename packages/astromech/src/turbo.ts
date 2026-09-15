/**
 * `turboConfig(config)` — the generated `turbo.json` for a repo's task
 * manifest, epic #672 D9 (#681). Every workspace, monorepo or single-package
 * (Turborepo's single-package mode), gets this from the same `tasks` array
 * that already drives thin callers / required checks / package scripts —
 * never hand-authored.
 *
 * Only tasks with a {@link TurboTaskConfig} in the registry (real per-
 * workspace build/compile/test steps) get an entry. Whole-repo, single-run
 * tools (prettier, gitleaks, commitlint, yamllint, …) have none — they stay
 * off turbo.json entirely, same as today.
 *
 * A task entry's own `turbo.passThroughEnv` (schema.ts) appends extra env
 * vars to the registry default's cache-key hashing — the one thing that's
 * genuinely per-repo (e.g. a package tagging Sentry releases during its own
 * build needs `SENTRY_AUTH_TOKEN` in its cache key; most repos don't).
 */

import { normalizeTaskEntry, type TasksConfig } from "./config/schema.js";
import { TASKS } from "./registry.js";

/** Filed once per repo, unconditionally — every generated turbo.json's root. */
const GLOBAL_DEPENDENCIES = ["pnpm-workspace.yaml", "tsconfig.json"];

/**
 * `turbo.json` content for this manifest, pretty-printed — write it
 * directly, no merge (matches `thinCallers()` / `reusableTemplates()`: this
 * file is generated, not hand-edited). `null` when no task in the manifest
 * has turbo fan-out config (nothing to write).
 */
export function turboConfig(config: TasksConfig): string | null {
	const entries = (config.tasks ?? []).map(normalizeTaskEntry);
	const tasks: Record<
		string,
		{ inputs: string[]; outputs: string[]; dependsOn: string[]; passThroughEnv?: string[] }
	> = {};

	for (const entry of entries) {
		if (entry.local === false) continue;
		const turbo = TASKS[entry.name]?.turbo;
		if (!turbo) continue;
		const extraEnv = entry.turbo?.passThroughEnv;
		tasks[entry.name] = extraEnv && extraEnv.length > 0 ? { ...turbo, passThroughEnv: extraEnv } : turbo;
	}

	if (Object.keys(tasks).length === 0) return null;

	return `${JSON.stringify(
		{
			$schema: "https://turborepo.org/schema.json",
			globalDependencies: GLOBAL_DEPENDENCIES,
			tasks,
		},
		null,
		2
	)}\n`;
}
