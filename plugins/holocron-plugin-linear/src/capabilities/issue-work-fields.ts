/**
 * Effort and the dates of an issue on an `IssueRecord` (spec `tool-work-commands`, open question 9, #2496). Linear's
 * estimate is the effort on the usual 1-3-5 scale (an estimate of any other number is no effort, nothing is invented),
 * its `dueDate` is the target date, and it has no start date, which `droppedFor()` reports.
 *
 * Not verified against the live API: how a team with estimates off answers a write of one (a `dropped` line, never a failure).
 */

import type { IssueEffort, IssueRecord } from "@theholocron/cli";
import type { LinearClient, LinearIssue } from "@theholocron/linear-client";

/** Linear's estimate for each effort. */
export const ESTIMATE: Record<IssueEffort, number> = { low: 1, medium: 3, high: 5 };

/** The effort and target date a Linear issue holds, for an `IssueRecord`; what it does not hold is left out. */
export function workFieldsOf(
	issue: Pick<LinearIssue, "estimate" | "dueDate">
): Pick<IssueRecord, "effort" | "targetDate"> {
	const effort = (Object.keys(ESTIMATE) as IssueEffort[]).find((e) => ESTIMATE[e] === issue.estimate);
	return {
		...(effort ? { effort } : {}),
		...(issue.dueDate ? { targetDate: issue.dueDate.slice(0, 10) } : {}),
	};
}

/**
 * Sets the estimate of an issue on its own, so a team that refuses it does not lose the rest of a write; a refusal comes
 * back as a `dropped` line.
 */
export async function setEstimate(client: LinearClient, id: string, effort: IssueEffort): Promise<string | undefined> {
	try {
		await client.issues.update(id, { estimate: ESTIMATE[effort] });
		return undefined;
	} catch (err) {
		return `effort ${effort} (${(err as Error).message})`;
	}
}
