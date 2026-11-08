import type { LinearGitAutomationState, LinearWorkflowState } from "@theholocron/linear-client";

import type { GitAutomationSetting } from "./provider-config.js";

/** What to send for one declared git rule so the team matches it. */
export type GitAction =
	| { kind: "create"; event: GitAutomationSetting["event"]; stateId: string; branch?: string }
	| { kind: "update"; ruleId: string; stateId: string };

/** How one declared git rule differs from the team. */
export interface GitGap {
	/** The row id: `git:start`, or `git:merge@main` for a rule limited to a branch. */
	id: string;
	/** The row title. */
	title: string;
	/** One line per difference, worded for a failing row. Empty when the team already matches. */
	problems: string[];
	/** What to send to make the team match; undefined when it already does or the state cannot be resolved. */
	action?: GitAction;
	/** The declared state name that the team does not have: nothing can be sent. */
	unresolved: boolean;
}

/** Whether a rule is the one for this event and branch; a regular-expression target never matches a literal name. */
function matches(rule: LinearGitAutomationState, want: GitAutomationSetting): boolean {
	if (rule.event !== want.event) return false;
	if (want.branch === undefined) return rule.targetBranch === null;
	return rule.targetBranch !== null && !rule.targetBranch.isRegex && rule.targetBranch.branchPattern === want.branch;
}

/**
 * Compares each declared git rule (`event`, `state`, optional literal target `branch`) with the team's rules. A rule is
 * found by its event and branch, never by id, so one made by hand is adopted; its state is what is compared. Rules the
 * block does not declare are never reported or touched.
 */
export function gitGaps(
	want: readonly GitAutomationSetting[],
	have: readonly LinearGitAutomationState[],
	states: readonly LinearWorkflowState[]
): GitGap[] {
	return want.map((rule) => {
		const label = rule.branch === undefined ? rule.event : `${rule.event}@${rule.branch}`;
		const gap: GitGap = { id: `git:${label}`, title: `git automation ${label}`, problems: [], unresolved: false };
		const wanted = rule.state.toLowerCase();
		const state = states.find((s) => s.name.toLowerCase() === wanted);
		if (!state) {
			gap.unresolved = true;
			gap.problems.push(`the team has no state "${rule.state}" for ${label}`);
			return gap;
		}
		const found = have.find((r) => matches(r, rule));
		if (!found) {
			gap.problems.push(`no ${label} rule, declared ${state.name}`);
			gap.action = {
				kind: "create",
				event: rule.event,
				stateId: state.id,
				...(rule.branch === undefined ? {} : { branch: rule.branch }),
			};
		} else if (found.state?.id !== state.id) {
			gap.problems.push(`${label} moves to ${found.state?.name ?? "nothing"}, declared ${state.name}`);
			gap.action = { kind: "update", ruleId: found.id, stateId: state.id };
		}
		return gap;
	});
}

/** The id of each literal target branch some existing rule uses, by name, so setup does not make one twice. */
export function knownBranches(have: readonly LinearGitAutomationState[]): Map<string, string> {
	const known = new Map<string, string>();
	for (const r of have) {
		if (r.targetBranch && !r.targetBranch.isRegex) known.set(r.targetBranch.branchPattern, r.targetBranch.id);
	}
	return known;
}
