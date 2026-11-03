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
 * `turbo.inputs` (holocron#845) appends extra input globs the same way —
 * for a package whose layout the registry default doesn't cover (e.g. a
 * flat-layout package with no `src/` directory at all).
 */

import { stringifyJson } from "@theholocron/json-utils";
import { addWorkspaceMember } from "@theholocron/pkg-utils";

import { normalizeTaskEntry, type TasksConfig } from "../../config/schema/index.js";
import { TASKS } from "../../registry/index.js";
import { formatJson } from "../../utils/index.js";
import { resolveTaskName, taskKey } from "../../vocabulary/index.js";
import { isGeneratedScript } from "../scripts/merge-scripts/index.js";
import { planSuites } from "../scripts/plan-suites/index.js";
import { planTasks } from "../scripts/plan-tasks/index.js";
import type { EnsureRootWorkspaceMemberResult, EnsureTurboDependencyResult } from "./turbo.type.js";

/**
 * Filed once per repo, unconditionally — every generated turbo.json's root. A change to any of these
 * selects every package under `--affected`.
 *
 * `holocron.config.*` and `astromech.config.*` define the tasks themselves. The lockfile is deliberately
 * not here: turbo already compares it per package, so a dependency bump only invalidates the packages
 * whose resolved dependencies changed. Workflow files are not here either, so a CI tweak is not a full run.
 */
const GLOBAL_DEPENDENCIES = ["pnpm-workspace.yaml", "tsconfig.json", "holocron.config.*", "astromech.config.*"];

/**
 * Guards against a malformed `turbo.inputs`/`turbo.passThroughEnv` override
 * (review on holocron#845): a bare string instead of an array would
 * otherwise spread into individual characters
 * (`[..."**\/*.ts"]` → `["*", "*", "/", "*", ".", "t", "s"]`), silently
 * emitting garbage entries instead of the intended single glob/env-var —
 * the generated `turbo.json` would still be valid JSON, just wrong, with
 * nothing surfacing the mistake. Only a config loaded from JSON or plain JS
 * reaches this unchecked; a typed `holocron.config.ts` via `defineConfig`
 * already rejects the wrong shape at compile time.
 */
function validatedGlobList(
	value: unknown,
	taskName: string,
	field: "inputs" | "passThroughEnv" | "dependsOn"
): string[] {
	if (value === undefined) return [];
	if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
		throw new Error(`task "${taskName}": turbo.${field} must be an array of strings, got ${JSON.stringify(value)}`);
	}
	return value;
}

/**
 * A turbo task reference (`build`, `^build`, `@x/config#build`) with a flat id in it spelled as the key that id has in
 * this manifest (`keys`), or, for a task the manifest does not list, as the entry that mentions it would spell it;
 * anything else (an old name, a `//#` root task) is kept.
 */
function turboRef(ref: string, keys: ReadonlyMap<string, string>, entryName: string): string {
	const prefix = ref.startsWith("^") ? "^" : "";
	const [task, ...scope] = ref.slice(prefix.length).split("#").reverse();
	const known = TASKS[task!] ? (keys.get(task!) ?? taskKey(entryName, task!)) : task!;
	return `${prefix}${[known, ...scope].reverse().join("#")}`;
}

/** What `turboConfig` needs to know about the repo besides its manifest. */
export interface TurboConfigOptions {
	/**
	 * A workspace, where `//#<id>` root tasks and the suite aggregator tasks exist (`scriptsFor` calls them). A single
	 * package has no use for either and turbo's single-package mode does not take root tasks.
	 */
	monorepo?: boolean;
}

interface TurboTask {
	inputs?: string[];
	outputs?: string[];
	dependsOn?: string[];
	passThroughEnv?: string[];
	cache?: false;
}

/**
 * `turbo.json` content for this manifest, pretty-printed — write it
 * directly, no merge (matches `thinCallers()` / `reusableTemplates()`: this
 * file is generated, not hand-edited). `null` when no task in the manifest
 * has turbo fan-out config (nothing to write).
 *
 * In a workspace it also carries, for what `scriptsFor` writes as root scripts: a `//#<id>` task for each repo-scoped
 * suite leaf whose root script holds the tool (uncached: it reads files of every package, which turbo would not hash), and
 * one aggregator task per suite that `dependsOn` its leaves, with no script of its own.
 */
export function turboConfig(config: TasksConfig, options: TurboConfigOptions = {}): string | null {
	const entries = (config.tasks ?? []).map(normalizeTaskEntry);
	const tasks: Record<string, TurboTask> = {};

	// The key each id has: it follows how its entry is spelled (see `taskKey`).
	const keys = new Map<string, string>();
	for (const entry of entries) {
		if (entry.local === false) continue;
		for (const { id } of resolveTaskName(entry.name)) {
			if (!keys.has(id)) keys.set(id, taskKey(entry.name, id));
		}
	}

	for (const entry of entries) {
		if (entry.local === false) continue;
		for (const { id } of resolveTaskName(entry.name)) {
			const registered = TASKS[id]?.turbo;
			if (!registered) continue;
			const key = keys.get(id)!;
			const turbo = {
				...registered,
				dependsOn: registered.dependsOn.map((ref) => turboRef(ref, keys, entry.name)),
			};

			const extraEnv = validatedGlobList(entry.turbo?.passThroughEnv, entry.name, "passThroughEnv");
			const extraInputs = validatedGlobList(entry.turbo?.inputs, entry.name, "inputs");
			const extraDependsOn = validatedGlobList(entry.turbo?.dependsOn, entry.name, "dependsOn").map((ref) =>
				turboRef(ref, keys, entry.name)
			);

			// A task declared in more than one config layer accumulates onto
			// whatever an earlier entry for the same name already contributed,
			// rather than a later, override-less entry silently overwriting it
			// (review on holocron#845) — mergeLayers() concatenates `tasks`
			// arrays rather than deduping by name, so the same task can
			// legitimately appear twice (once from holocron.config.ts's own
			// `tasks`, once from a dedicated astromech.config.ts merged on top).
			const current = tasks[key] ?? turbo;
			const passThroughEnv =
				extraEnv.length > 0 ? [...(current.passThroughEnv ?? []), ...extraEnv] : current.passThroughEnv;
			// Appended, not replaced — a flat-layout package adds its own glob
			// (e.g. "**/*.ts") without losing the registry's other tracked
			// inputs (package.json, tsdown.config.ts, …).
			const inputs = extraInputs.length > 0 ? [...current.inputs!, ...extraInputs] : current.inputs;
			// Appended too, and a task already waiting on it is not listed twice.
			const dependsOn = [...new Set([...current.dependsOn!, ...extraDependsOn])];

			tasks[key] = {
				...turbo,
				inputs,
				dependsOn,
				...(passThroughEnv && passThroughEnv.length > 0 ? { passThroughEnv } : {}),
			};
		}
	}

	if (options.monorepo) {
		const suites = planSuites(planTasks(config, TASKS), TASKS);
		// A root task exists so a suite can depend on it: a repo-scoped leaf outside every suite (`format`) has none.
		for (const leaves of suites.values()) {
			for (const leaf of leaves) {
				if (leaf.kind === "tool") tasks[`//#${leaf.script}`] = { cache: false };
			}
		}
		for (const [suite, leaves] of suites) {
			tasks[suite] = { dependsOn: leaves.map((leaf) => (leaf.kind === "tool" ? `//#${leaf.script}` : leaf.key)) };
		}
	}

	if (Object.keys(tasks).length === 0) return null;

	return formatJson({
		$schema: "https://turborepo.org/schema.json",
		globalDependencies: GLOBAL_DEPENDENCIES,
		tasks,
	});
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
 * A matching script key alone isn't enough — its *value* has to be a real
 * command, not the generated `holocron run <task> --` wrapper (#846, the
 * counterpart `mergePackageJsonScripts()` already had to learn for #747/
 * #748). A repo whose root predates this tooling can already have that exact
 * wrapper sitting in a task-name-matching script with nothing ever having
 * generated it this session; adding `.` there fires #747's recursion
 * immediately (`turbo run <task>` → root's own `<task>` script → the wrapper
 * → `holocron run <task>` sees `turbo.json` still defines it → `turbo run
 * <task>` again, forever). Only a matching script whose value is *not* that
 * wrapper counts as "root is genuinely a directly-buildable package".
 *
 * The edit itself is `addWorkspaceMember()` in `@theholocron/pkg-utils`: a
 * targeted line-based edit that only ever adds a line. This function decides
 * whether root needs it; it is a no-op (`changed: false`) whenever root
 * doesn't, root is already listed, or `packages:` isn't in the plain
 * block-list form every repo checked actually uses.
 */
export function ensureRootWorkspaceMember(
	workspaceYaml: string,
	rootScripts: Readonly<Record<string, string>>,
	taskNames: readonly string[]
): EnsureRootWorkspaceMemberResult {
	const rootHasEligibleTask = taskNames.some((t) => {
		const script = rootScripts[t];
		return script !== undefined && !isGeneratedScript(script);
	});
	if (!rootHasEligibleTask) return { content: workspaceYaml, changed: false };

	return addWorkspaceMember(workspaceYaml, ".");
}

/**
 * Fallback pin when a repo's own `pnpm-workspace.yaml` has no `turbo`
 * catalog entry yet — matches this repo's own catalog version (the
 * canonical source-of-truth repo for the whole org's tooling).
 */
const DEFAULT_TURBO_VERSION = "^2.10.12";

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
	return { content: stringifyJson(updated, { like: packageJson }), changed: true };
}
