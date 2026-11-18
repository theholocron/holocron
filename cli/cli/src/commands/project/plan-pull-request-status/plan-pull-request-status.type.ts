import type { BoardStatusCategory } from "../../../plugin/index.js";

/** Why a pull request moves an item's status. */
export type PullRequestStatusReason = "pull-request-open" | "checks-green" | "checks-failed";

/** The status change a pull request asks for. */
export interface PullRequestStatusChange {
	/** The item's `issues` key. */
	key: string;
	/** The item's title, for the printed line. */
	title: string;
	/** The status it holds now. */
	from: string;
	/** The template's status it is set to. */
	to: string;
	/** The category of `to`. */
	category: Extract<BoardStatusCategory, "active" | "review">;
	/** Which rule applies. */
	reason: PullRequestStatusReason;
}

/** A rule applies, but the template has no status of the category to set. Reported, never guessed. */
export interface PullRequestStatusUnresolved {
	/** The item's `issues` key. */
	key: string;
	/** The item's title. */
	title: string;
	/** The category the rule wanted. */
	category: PullRequestStatusChange["category"];
	/** Which rule applies. */
	reason: PullRequestStatusReason;
}

/** What {@link planPullRequestStatus} decided: a change or an unresolved rule (it returns `undefined` for nothing). */
export type PullRequestStatusPlan =
	| { kind: "change"; change: PullRequestStatusChange }
	| { kind: "unresolved"; unresolved: PullRequestStatusUnresolved };
