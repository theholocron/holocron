import { normalizeTaskEntry, type TasksConfig } from "../../../config/schema/index.js";
import type { TaskDef } from "../../../registry/index.js";
import { toolCommand } from "../../../tasks/run/tool-command/index.js";
import { resolveTaskName, scriptName, taskKey } from "../../../vocabulary/index.js";
import type { PlannedTask } from "./plan-tasks.type.js";

/**
 * The tasks a manifest can run locally, once per flat id, in manifest order: what `scriptsFor` and the `turbo.json`
 * generator both read, so a root script and the turbo task it calls never disagree.
 *
 * `local: null` alone means there is genuinely no local equivalent (CodeQL, a deploy); a `linterGroup` or `jobs`
 * task still runs through `holocron run`. An entry with `local: false` is left out, and so is an id the registry does
 * not know.
 */
export function planTasks(config: TasksConfig, registry: Record<string, TaskDef>): PlannedTask[] {
	const planned = new Map<string, PlannedTask>();
	for (const entry of (config.tasks ?? []).map(normalizeTaskEntry)) {
		if (entry.local === false) continue;
		for (const { id } of resolveTaskName(entry.name)) {
			const def = registry[id];
			if (def === undefined || planned.has(id)) continue;
			if (def.local === null && !def.linterGroup && !def.jobs) continue;
			const command = def.turbo ? null : toolCommand(def);
			planned.set(id, {
				entry: entry.name,
				id,
				script: scriptName(id),
				key: taskKey(entry.name, id),
				kind: def.turbo ? "turbo" : command === null ? "cli" : "tool",
				...(command === null ? {} : { command }),
			});
		}
	}
	return [...planned.values()];
}
