import type { WorkStatusGuard } from "./guard-work-status.type.js";

/** The statuses the board's rules own (`planReconcile()`, `planPullRequestStatus()`), lower-cased with single spaces. */
export const AUTOMATED_STATUSES = ["in review", "blocked", "done"] as const;

const normal = (status: string) =>
	status
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, " ");

/**
 * Decides whether `update work --status` may set a status (spec `tool-work-commands`, decision 3). In Review, Blocked
 * and Done belong to the board's automation, which overwrites a hand-set value, so they are refused unless `force` says
 * the automation is down; any other status needs no flag. The words are compared without case, and `in-review` and
 * `In_Review` count as `In Review`.
 */
export function guardWorkStatus(status: string, force: boolean | undefined): WorkStatusGuard {
	const owned = (AUTOMATED_STATUSES as readonly string[]).includes(normal(status));
	if (!owned) return { ok: true, forced: false };
	if (force) return { ok: true, forced: true };
	return {
		ok: false,
		problem: `"${status.trim()}" is set by the board's automation (the pull request, a blocked-by link, the issue closing) and would be overwritten; pass --force only while the automation is down`,
	};
}
