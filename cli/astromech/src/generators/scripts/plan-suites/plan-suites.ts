import type { TaskDef } from "../../../registry/index.js";
import type { PlannedTask } from "../plan-tasks/index.js";

/**
 * The suites of a plan with the planned leaves that take part in them, in registry (run) order. Only a leaf a turbo
 * repo has a script for counts (`turbo` and `tool`); a suite none of whose configured leaves has one is not in the map,
 * so no aggregator task and no root script exists for it.
 */
export function planSuites(
	planned: readonly PlannedTask[],
	registry: Record<string, TaskDef>
): Map<string, PlannedTask[]> {
	const byId = new Map(planned.filter((task) => task.kind !== "cli").map((task) => [task.id, task] as const));
	const suites = new Map<string, PlannedTask[]>();
	for (const [id, def] of Object.entries(registry)) {
		const leaf = byId.get(id);
		if (def.suite === undefined || leaf === undefined) continue;
		suites.set(def.suite, [...(suites.get(def.suite) ?? []), leaf]);
	}
	return suites;
}
