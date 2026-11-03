import type { TaskGroup } from "../../registry/index.js";
import { TASKS } from "../../registry/index.js";
import { suiteMembers, SUITES } from "../suites/index.js";

const GROUP_ORDER: TaskGroup[] = ["Verification", "Source Quality", "Security", "Delivery", "Platform", "Knowledge"];

/**
 * The text of `holocron run --help`: the suites with their leaves, and the tasks that are not in a suite, under the six
 * intent groups (which survive only as this grouping and the docs table).
 */
export function describeTasks(): string {
	const lines: string[] = [];
	for (const group of GROUP_ORDER) {
		const ids = Object.keys(TASKS).filter((id) => TASKS[id]!.group === group);
		lines.push(`${group}:`);
		for (const suite of SUITES) {
			const leaves = suiteMembers(suite).filter((id) => ids.includes(id));
			if (leaves.length > 0) lines.push(`  ${suite} (suite)  ${leaves.join(", ")}`);
		}
		lines.push(`  ${ids.filter((id) => !TASKS[id]!.suite).join(", ")}`);
	}
	lines.push(
		"",
		"`holocron run <suite>` runs every leaf the repo lists; `holocron run <suite> <leaf>` (or `<suite>:<leaf>`) runs one."
	);
	return lines.join("\n");
}
