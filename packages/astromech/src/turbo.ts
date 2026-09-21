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

export interface EnsureRootWorkspaceMemberResult {
	content: string;
	changed: boolean;
}

/**
 * Fixes #692: `turboConfig()` writes a `turbo.json` the moment *any* task in
 * the manifest has fan-out config — with no check for whether the repo's own
 * root package is actually covered by `pnpm-workspace.yaml`'s `packages:`
 * list. A repo shaped like `observability` (the library lives at repo root;
 * `packages:` lists only an unrelated `docs` site) silently breaks the
 * instant `turbo.json` exists: `holocron run <task>` switches from running
 * root's own script directly to `turbo run <task>`, which only sees declared
 * workspace members — root vanishes, the task "succeeds" with zero real work
 * done (confirmed empirically: `Packages in scope: docs`, root never
 * mentioned, exit 0).
 *
 * Detection is narrow and specific: root only needs to be an explicit
 * workspace member if its *own* `package.json` has a script literally named
 * after one of the tasks turbo.json is about to fan out — a plain
 * orchestrator root (`holocron`'s own `"build": "turbo run delivery.build"`,
 * which has no `delivery.build` script itself) never trips this; only a root
 * that's genuinely a directly-buildable package does. Confirmed the fix
 * empirically too — adding `.` to `packages:` makes turbo pick root back up
 * (`Packages in scope: docs, root-lib`) without disturbing the sibling
 * package's own caching.
 *
 * A targeted line-based edit, not a full YAML parse/reserialize — same
 * pattern `codecov.ts`'s `mergeCodecovComponents()` already uses for editing
 * an existing generated file. `pnpm-workspace.yaml` routinely carries a
 * `catalog:`/`catalogs:`/`overrides:` block after `packages:`; a real parser
 * round-trip risks reformatting or reordering content nobody asked to touch.
 * Only ever *adds* a line — never rewrites or reorders anything already
 * there — and is a no-op (`changed: false`) whenever root doesn't need it,
 * root is already listed, or `packages:` isn't in the plain block-list form
 * every repo checked actually uses.
 */
export function ensureRootWorkspaceMember(
	workspaceYaml: string,
	rootScripts: readonly string[],
	taskNames: readonly string[]
): EnsureRootWorkspaceMemberResult {
	const rootHasEligibleTask = taskNames.some((t) => rootScripts.includes(t));
	if (!rootHasEligibleTask) return { content: workspaceYaml, changed: false };

	const lines = workspaceYaml.split("\n");
	const packagesLineIdx = lines.findIndex((l) => /^packages:\s*$/.test(l));
	if (packagesLineIdx === -1) return { content: workspaceYaml, changed: false };

	const items: string[] = [];
	let cursor = packagesLineIdx + 1;
	while (cursor < lines.length && /^\s*-\s*/.test(lines[cursor]!)) {
		items.push(lines[cursor]!);
		cursor++;
	}

	const alreadyIncluded = items.some((item) => {
		const value = item
			.replace(/^\s*-\s*/, "")
			.replace(/^["']|["']$/g, "")
			.trim();
		return value === "." || value === "";
	});
	if (alreadyIncluded) return { content: workspaceYaml, changed: false };

	const indent = items[0]?.match(/^(\s*-\s*)/)?.[1] ?? "  - ";
	const newLine = `${indent}"."`;
	const newLines = [...lines.slice(0, packagesLineIdx + 1), newLine, ...lines.slice(packagesLineIdx + 1)];
	return { content: newLines.join("\n"), changed: true };
}

/**
 * Fallback pin when a repo's own `pnpm-workspace.yaml` has no `turbo`
 * catalog entry yet — matches this repo's own catalog version (the
 * canonical source-of-truth repo for the whole org's tooling).
 */
const DEFAULT_TURBO_VERSION = "^2.10.12";

export interface EnsureTurboDependencyResult {
	content: string;
	changed: boolean;
}

/**
 * Ensures `turbo` is declared in `package.json#devDependencies` — found
 * the hard way rolling this out to `observability` (predates #691):
 * `turboConfig()` writes a `turbo.json` the moment any task has fan-out
 * config, but never touches `package.json`, so a repo that predates this
 * feature (or never had `turbo` installed for any other reason) ends up
 * with a `turbo.json` and nothing local to run it. `resolveBin()`
 * (`run.ts`) falls back to a bare `turbo` on `PATH` when
 * `node_modules/.bin/turbo` doesn't exist — on a machine with no global
 * `turbo` at all that's a hard failure for every task; on one that
 * happens to have an unrelated global install, silent version skew
 * (confirmed empirically: a global 2.6.0 rejected this repo's generated
 * `turbo.json` outright — `Found an unknown key "globalDependencies"`,
 * a schema key from a newer version than the one actually resolved).
 *
 * Prefers `"catalog:"` when the repo's own `pnpm-workspace.yaml` already
 * has a `turbo` catalog entry — matches every already-migrated repo
 * (`holocron`, `clients`, …) — falling back to a real pinned version
 * otherwise. Never touches an existing `devDependencies.turbo` entry, so
 * a repo pinning its own version on purpose is left alone — idempotent,
 * a no-op once set either way.
 */
export function ensureTurboDependency(packageJson: string, workspaceYaml: string): EnsureTurboDependencyResult {
	const pkg = JSON.parse(packageJson) as { devDependencies?: Record<string, string> };
	if (typeof pkg.devDependencies?.turbo === "string") return { content: packageJson, changed: false };

	const hasTurboCatalogEntry = /^\s*turbo:\s*\S/m.test(workspaceYaml);
	const devDependencies = {
		...pkg.devDependencies,
		turbo: hasTurboCatalogEntry ? "catalog:" : DEFAULT_TURBO_VERSION,
	};
	const updated = { ...pkg, devDependencies };
	return { content: `${JSON.stringify(updated, null, 2)}\n`, changed: true };
}
