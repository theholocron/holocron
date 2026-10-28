import { createAstromech } from "@theholocron/astromech";
import { loadTasksConfig } from "@theholocron/astromech/config";

import type { CommandEntry } from "../command-registry/index.js";

/**
 * This repo's own resolved task manifest, filtered to what's actually
 * runnable locally — `Astromech.runnableTasks()`, reused rather than
 * reimplemented (deliberately *not* `packageScripts()`, whose
 * `syncScripts: false` short-circuit returns `{}` for repos — this one
 * included — that opt out of generated `package.json` scripts but still
 * have real runnable tasks). Empty (never throws) when there's no config to
 * resolve — feeds {@link buildRunMenuEntries}, which renders an empty list
 * as "run ›" simply having no children.
 */
export async function listRunnableTasks(argv: Record<string, unknown>): Promise<string[]> {
	const cwd = typeof argv.cwd === "string" ? argv.cwd : process.cwd();
	const config = await loadTasksConfig(cwd).catch(() => undefined);
	return createAstromech({ cwd, config }).runnableTasks();
}

/**
 * Namespace display order for the `run` menu — deliberately its own thing,
 * not `@theholocron/astromech`'s `CI_ORDER`: that one is tuned for "cheapest
 * signal first" in an automated gate, a different goal from "how a person
 * would naturally work through a repo" (build it, clean up its style, check
 * it's secure, test it, validate it, document it). A namespace absent here
 * (a repo-specific one this list doesn't know about) sorts after every
 * named one, in whatever order it was first seen.
 */
const RUN_MENU_NAMESPACE_ORDER = ["delivery", "sourceQuality", "security", "verification", "platform", "knowledge"];

/**
 * Splits `taskNames` (`"sourceQuality.staticAnalysis"`, …) into namespace
 * groups, ordered by {@link RUN_MENU_NAMESPACE_ORDER} — insertion order
 * within each group is `taskNames`' own order (already declaration order,
 * from {@link listRunnableTasks}). A name with no `.` at all (defensive;
 * every real registry task has a namespace) is its own bucket, keyed by the
 * full name, sorted after every namespaced group.
 */
function groupByNamespace(taskNames: string[]): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	for (const name of taskNames) {
		const dot = name.indexOf(".");
		const key = dot === -1 ? name : name.slice(0, dot);
		const list = groups.get(key);
		if (list) list.push(name);
		else groups.set(key, [name]);
	}
	const ordered = new Map<string, string[]>();
	const byMenuOrder = (a: string, b: string) => {
		const ia = RUN_MENU_NAMESPACE_ORDER.indexOf(a);
		const ib = RUN_MENU_NAMESPACE_ORDER.indexOf(b);
		if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
		return 0; // neither is known — keep Map's own insertion (first-seen) order
	};
	for (const key of [...groups.keys()].sort(byMenuOrder)) ordered.set(key, groups.get(key)!);
	return ordered;
}

/**
 * Dynamically-built `run` sub-entries for every locally-runnable task
 * ({@link listRunnableTasks}), grouped by namespace and merged into
 * `COMMAND_REGISTRY` at `cli.ts`'s `$0` call site — not a registry entry
 * itself, since the task set is per-repo, not a static surface this module
 * can hand-enumerate.
 *
 * Each namespace becomes a group with a leading "<namespace> (run it)" item
 * (`holocron run <namespace>` — every task in it, via
 * `Astromech.runGroup()`) alongside each of its individual tasks, the exact
 * same "a group that's also runnable" shape `menuItems` already renders for
 * `repo sync` / `deploy` — reached here for free by using a space, not the
 * task's own `.`, between namespace and leaf in `name` (`spawnArgs` carries
 * the real dotted invocation `buildChildArgv` actually spawns).
 */
export function buildRunMenuEntries(taskNames: string[]): CommandEntry[] {
	const entries: CommandEntry[] = [];
	for (const [namespace, tasks] of groupByNamespace(taskNames)) {
		const isRealNamespace = tasks[0] !== namespace || tasks.length > 1;
		if (isRealNamespace) {
			entries.push({
				name: `run ${namespace}`,
				description: `Run every ${namespace}.* task in sequence`,
				positionals: [],
				supportsDryRun: true,
				spawnArgs: ["run", namespace],
			});
		}
		for (const task of tasks) {
			const leaf = task === namespace ? namespace : task.slice(namespace.length + 1);
			entries.push({
				name: isRealNamespace ? `run ${namespace} ${leaf}` : `run ${leaf}`,
				description: `Run ${task}`,
				positionals: [],
				supportsDryRun: true,
				spawnArgs: ["run", task],
			});
		}
	}
	return entries;
}
