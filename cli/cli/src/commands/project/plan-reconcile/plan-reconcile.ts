import type { BoardItem, BoardStatusCategory, BoardTemplate } from "../../../plugin/index.js";
import type { ReconcileChange, ReconcilePlan, ReconcileReason } from "./plan-reconcile.type.js";

/**
 * Decide the status changes that keep a board true (spec `command-project`, "Keeping a board true"). Pure: it reads
 * the items and the template and touches nothing. Status only, never priority or any other field.
 *
 * - closed or merged, not in a `done` status: set to `done` (whatever the blockers say);
 * - open with no status: not changed, listed in `unset` (it needs a decision, not a rule; this holds even when it has a
 *   blocker);
 * - open with an open blocker, not in a `blocked` status: set to `blocked`;
 * - open, in a `blocked` status, with no open blocker: set to `planned` (the status it held before is unknown).
 *
 * Where a category has several statuses the first in template order is used; where it has none the item is listed in
 * `unresolved` and nothing is guessed. An item's category is read from the template by its status name, falling back
 * to the one the provider reports. Applying the changes and planning again gives no change.
 */
export function planReconcile(items: readonly BoardItem[], template: BoardTemplate): ReconcilePlan {
	const target = (category: BoardStatusCategory) => template.statuses.find((s) => s.category === category)?.name;
	const plan: ReconcilePlan = { changes: [], unset: [], unresolved: [] };

	for (const item of items) {
		const category: BoardStatusCategory | undefined =
			item.status === undefined
				? undefined
				: (template.statuses.find((s) => s.name === item.status)?.category ?? item.category);

		let want: ReconcileChange["category"] | undefined;
		let reason: ReconcileReason | undefined;
		if (!item.open) {
			if (category !== "done") [want, reason] = ["done", "closed"];
		} else if (item.status === undefined) {
			plan.unset.push(item);
			continue;
		} else if (item.blockedBy.length > 0) {
			if (category !== "blocked") [want, reason] = ["blocked", "blocked"];
		} else if (category === "blocked") {
			[want, reason] = ["planned", "unblocked"];
		}
		if (want === undefined || reason === undefined) continue;

		const to = target(want);
		if (to === undefined) {
			plan.unresolved.push({ key: item.key, title: item.title, category: want, reason });
			continue;
		}
		plan.changes.push({
			key: item.key,
			title: item.title,
			...(item.status !== undefined ? { from: item.status } : {}),
			to,
			category: want,
			reason,
		});
	}
	return plan;
}
