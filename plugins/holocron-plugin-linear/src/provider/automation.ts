import type { LinearTeamAutomation, LinearWorkflowState } from "@theholocron/linear-client";

import type { LinearSetupConfig } from "./provider-config.js";

/** What `teamUpdate` takes for the auto-close and auto-archive settings. */
export interface AutomationPatch {
	autoArchivePeriod?: number;
	autoClosePeriod?: number;
	autoCloseStateId?: string;
}

/** How one declared setting differs from the team. */
export interface AutomationGap {
	/** One line per difference, worded for a failing row. Empty when the team already matches. */
	problems: string[];
	/** What to send to make the team match. Empty when it already does or the setting cannot be resolved. */
	patch: AutomationPatch;
	/** A name in the declaration (the close state) that the team does not have: nothing can be sent. */
	unresolved: boolean;
}

const months = (n: number | null): string => (n ? `${n} month${n === 1 ? "" : "s"}` : "off");

/** Compares `autoClose` (period and state) with the team. */
export function closeGap(
	want: NonNullable<LinearSetupConfig["autoClose"]>,
	have: LinearTeamAutomation,
	states: readonly LinearWorkflowState[]
): AutomationGap {
	const gap: AutomationGap = { problems: [], patch: {}, unresolved: false };
	if ((have.autoClosePeriod ?? 0) !== want.months) {
		gap.problems.push(`auto-close is ${months(have.autoClosePeriod)}, declared ${months(want.months)}`);
		gap.patch.autoClosePeriod = want.months;
	}
	if (want.state) {
		const wanted = want.state.toLowerCase();
		const state = states.find((s) => s.name.toLowerCase() === wanted);
		if (!state) {
			gap.unresolved = true;
			gap.patch = {};
			gap.problems.push(`the team has no state "${want.state}" to put auto-closed issues in`);
		} else if (have.autoCloseState?.id !== state.id) {
			gap.problems.push(`auto-close state is ${have.autoCloseState?.name ?? "not set"}, declared ${state.name}`);
			gap.patch.autoCloseStateId = state.id;
		}
	}
	return gap;
}

/** Compares `autoArchive` with the team. */
export function archiveGap(
	want: NonNullable<LinearSetupConfig["autoArchive"]>,
	have: LinearTeamAutomation
): AutomationGap {
	if ((have.autoArchivePeriod ?? 0) === want.months) return { problems: [], patch: {}, unresolved: false };
	return {
		problems: [`auto-archive is ${months(have.autoArchivePeriod)}, declared ${months(want.months)}`],
		patch: { autoArchivePeriod: want.months },
		unresolved: false,
	};
}
