import { LEGACY_NAMES } from "@theholocron/astromech";

import type { CheckRow } from "../doctor-checks/index.js";
import { problemRow } from "./problem-row.js";

/**
 * The `tasks` row: a `tasks:` entry in the config that uses a deprecated alias (an old dotted name, `validate`,
 * `stale`, ...) is a problem, and the problem line names the flat id or ids that replace it. This is what
 * `holocron probe tasks names` finds in the files, read here through the config.
 */
export function tasksRow(names: readonly string[]): CheckRow {
	const problems = names.flatMap((name) => {
		if (!Object.hasOwn(LEGACY_NAMES, name)) return [];
		const replacement = LEGACY_NAMES[name]!.map((target) => target.id).join(", ");
		return [`${name}: a deprecated alias; use ${replacement}`];
	});
	return problemRow("tasks", "tasks use flat ids", problems, `${names.length} of ${names.length} use flat ids`);
}
