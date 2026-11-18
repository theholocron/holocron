import type { BoardItem, BoardStatusCategory, BoardTemplate } from "../../../plugin/index.js";
import type {
	PullRequestStatusChange,
	PullRequestStatusPlan,
	PullRequestStatusReason,
} from "./plan-pull-request-status.type.js";

/**
 * Decide the status an item's linked pull requests ask for (spec `tech-board-status-automation`, #2388). Pure: it reads
 * one item and the template and touches nothing; status only, never priority or any other field.
 *
 * - an open linked pull request (a draft counts) puts the item in `active`;
 * - an open one whose aggregate check is `success` puts it in `review`;
 * - when the item is in `review` and no open pull request is green, a `failure` moves it back to `active`, while
 *   `pending` and `none` leave it, so a re-run after a push does not flicker the board;
 * - no open pull request: no change (closed and merged ones are `planReconcile()`'s, through the closed issue).
 *
 * Left to `planReconcile()`, which runs first: a closed item, an item with an open blocker or in `blocked`, and an
 * item with no status (reported there, not set). An item in `done` is left alone. Where the template has no status of
 * the wanted category the rule comes back as `unresolved` and nothing is guessed; where a category has several statuses
 * the first in template order is used. Applying the change and planning again gives no change.
 */
export function planPullRequestStatus(item: BoardItem, template: BoardTemplate): PullRequestStatusPlan | undefined {
	if (!item.open || item.status === undefined || item.blockedBy.length > 0) return undefined;
	const category: BoardStatusCategory | undefined =
		template.statuses.find((s) => s.name === item.status)?.category ?? item.category;
	if (category === "blocked" || category === "done") return undefined;

	const open = (item.pullRequests ?? []).filter((pr) => pr.state === "open");
	if (open.length === 0) return undefined;

	let want: PullRequestStatusChange["category"] | undefined;
	let reason: PullRequestStatusReason | undefined;
	if (open.some((pr) => pr.checks === "success")) {
		if (category !== "review") [want, reason] = ["review", "checks-green"];
	} else if (category === "review") {
		if (open.some((pr) => pr.checks === "failure")) [want, reason] = ["active", "checks-failed"];
	} else if (category !== "active") {
		[want, reason] = ["active", "pull-request-open"];
	}
	if (want === undefined || reason === undefined) return undefined;

	const to = template.statuses.find((s) => s.category === want)?.name;
	if (to === undefined) {
		return { kind: "unresolved", unresolved: { key: item.key, title: item.title, category: want, reason } };
	}
	return {
		kind: "change",
		change: { key: item.key, title: item.title, from: item.status, to, category: want, reason },
	};
}
