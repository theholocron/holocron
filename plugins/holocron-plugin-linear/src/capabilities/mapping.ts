/**
 * How Linear's vocabulary lines up with Holocron's: priority numbers, workflow state types and the board categories.
 * Pure functions, so the capabilities stay short and the rules are tested in one place.
 */

import type { BoardStatusCategory, IssuePriority, StatusCategory } from "@theholocron/cli";
import type { LinearPriority, LinearStateType, LinearWorkflowState } from "@theholocron/linear-client";

const TO_LINEAR: Record<IssuePriority, LinearPriority> = { none: 0, urgent: 1, high: 2, medium: 3, low: 4 };
const FROM_LINEAR: IssuePriority[] = ["none", "urgent", "high", "medium", "low"];

/** Linear's number for a neutral priority. */
export function toLinearPriority(priority: IssuePriority | undefined): LinearPriority {
	return priority ? TO_LINEAR[priority] : 0;
}

/** The neutral priority for Linear's number; `undefined` for none, so a record only carries one that was set. */
export function fromLinearPriority(priority: number): IssuePriority | undefined {
	const p = FROM_LINEAR[priority];
	return p && p !== "none" ? p : undefined;
}

/** The `issues` capability's status category for a Linear state. */
export function statusCategory(state: { type: LinearStateType; name: string }): StatusCategory {
	switch (state.type) {
		case "triage":
		case "backlog":
		case "unstarted":
			return "open";
		case "started":
			return /review/i.test(state.name) ? "in-review" : "in-progress";
		case "completed":
		case "canceled":
			return "done";
	}
}

/** Whether the state ends an issue's life. */
export function isClosed(type: LinearStateType): boolean {
	return type === "completed" || type === "canceled";
}

/** The board category for a Linear state; a started state named like "Blocked" is `blocked`. */
export function boardCategory(state: { type: LinearStateType; name: string }): BoardStatusCategory {
	switch (state.type) {
		case "triage":
		case "backlog":
			return "backlog";
		case "unstarted":
			return "planned";
		case "started":
			return /block/i.test(state.name) ? "blocked" : "active";
		case "completed":
		case "canceled":
			return "done";
	}
}

/** The Linear state type a new board status of this category is made as. */
export function stateTypeFor(category: BoardStatusCategory): LinearStateType {
	switch (category) {
		case "backlog":
			return "backlog";
		case "planned":
			return "unstarted";
		case "active":
		case "blocked":
			return "started";
		case "done":
			return "completed";
	}
}

/** The state an issue with this status category and name lands in: the name when the team has it, else the type's first. */
export function pickState(
	states: LinearWorkflowState[],
	want: { name?: string; category: StatusCategory; closed?: boolean }
): LinearWorkflowState | undefined {
	const byName = want.name ? states.find((s) => s.name.toLowerCase() === want.name!.toLowerCase()) : undefined;
	if (byName) return byName;
	// Types are tried in the order given, so an open issue lands in Todo before Backlog.
	const first = (...types: LinearStateType[]) => {
		for (const type of types) {
			const found = states.find((s) => s.type === type);
			if (found) return found;
		}
		return undefined;
	};
	if (want.closed || want.category === "done") return first("completed") ?? first("canceled");
	if (want.category === "in-review") {
		return states.find((s) => s.type === "started" && /review/i.test(s.name)) ?? first("started");
	}
	if (want.category === "in-progress") return first("started");
	return first("unstarted", "backlog", "triage");
}

/** `ENG-42` from `ENG-42`, `42` or `#42`; the team key fills a bare number. */
export function normalizeKey(key: string, teamKey: string): string {
	const trimmed = key.trim().replace(/^#/, "");
	return /^\d+$/.test(trimmed) ? `${teamKey}-${trimmed}` : trimmed.toUpperCase();
}
