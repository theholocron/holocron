import { normalizeTaskEntry, type TasksConfig } from "../../config/schema/index.js";

/**
 * The version groups a repo releases on their own: the folder names listed under `groups`
 * in its `delivery.publish` task. This is what the generated publish workflow reads, so a
 * release config that asks here stays in step with it instead of keeping a second list.
 * `[]` for a repo that releases as one.
 */
export function releaseGroups(config: Pick<TasksConfig, "tasks">): string[] {
	const publish = (config.tasks ?? []).map(normalizeTaskEntry).find((entry) => entry.name === "delivery.publish");
	const groups = publish?.with?.["groups"];
	if (!Array.isArray(groups)) return [];
	return groups.flatMap((group: unknown) => {
		const name = typeof group === "string" ? group : (group as { name?: unknown } | null)?.name;
		return typeof name === "string" ? [name] : [];
	});
}
