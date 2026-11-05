import type { BoardItem, BoardStatusCategory } from "../../../plugin/index.js";

/** Why an item's status is changed. */
export type ReconcileReason = "blocked" | "unblocked" | "closed";

/** One status change `reconcile` makes. */
export interface ReconcileChange {
	/** The item's `issues` key. */
	key: string;
	/** The item's title, for the printed line. */
	title: string;
	/** The status it holds now, or undefined for none. */
	from?: string;
	/** The template's status it is set to. */
	to: string;
	/** The category of `to`. */
	category: Extract<BoardStatusCategory, "blocked" | "planned" | "done">;
	/** Which rule applies. */
	reason: ReconcileReason;
}

/** An item a rule applies to, but whose template has no status of the category to set. Reported, never guessed. */
export interface ReconcileUnresolved {
	/** The item's `issues` key. */
	key: string;
	/** The item's title. */
	title: string;
	/** The category the rule wanted. */
	category: ReconcileChange["category"];
	/** Which rule applies. */
	reason: ReconcileReason;
}

/** What {@link planReconcile} decided. */
export interface ReconcilePlan {
	/** The status changes to make, in the items' order. */
	changes: ReconcileChange[];
	/** Open items with no status: reported, not set, since they need a decision and not a rule. */
	unset: BoardItem[];
	/** Items a rule applies to whose template lacks a status of the category. */
	unresolved: ReconcileUnresolved[];
}
