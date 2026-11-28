import type { CheckRow } from "@theholocron/kyber/ui";

import { callerProblems } from "./caller-problems.js";
import type { ParsedCaller } from "./doctor-ci.type.js";
import { problemRow } from "./problem-row.js";

/**
 * The `callers` row: every generated caller's file, workflow and job names equal its task id. A skip when the repo has
 * no generated caller to look at.
 */
export function callersRow(callers: readonly ParsedCaller[]): CheckRow {
	const id = "callers";
	const title = "callers are named for their task id";
	if (callers.length === 0) {
		return { id, title, status: "skip", detail: "no generated callers in .github/workflows", problems: [] };
	}
	return problemRow(id, title, callerProblems(callers), `${callers.length} of ${callers.length} named for their id`);
}
