import type { SentinelEvent } from "../../../utils/webhook/index.js";
import type { BoardStatusTrigger } from "../board-status.type.js";

/** The `pull_request` actions that can change what a pull request means for the issues it closes. */
const ACTIONS: ReadonlySet<string> = new Set([
	"opened",
	"reopened",
	"ready_for_review",
	"converted_to_draft",
	"closed",
]);

/**
 * What the board should do for a webhook event (spec `tech-board-status-automation`, part 5), or `undefined` when the
 * event is not one the rules read: a push to the branch, an edit, a review, a label, another check run. The aggregate
 * check is narrowed again (name and conclusion) by `runBoardStatus` before anything is fetched.
 */
export function toBoardStatusTrigger(event: SentinelEvent): BoardStatusTrigger | undefined {
	const numbers = event.pullNumbers;
	if (!numbers) return undefined;
	switch (event.type) {
		case "pull_request.opened":
		case "pull_request.feed":
			return event.action !== undefined && ACTIONS.has(event.action)
				? { kind: "pull_request", action: event.action, numbers }
				: undefined;
		case "check_run.completed":
			return event.checkRun ? { kind: "check_run", numbers, check: event.checkRun } : undefined;
		default:
			return undefined;
	}
}
