import type { Item } from "./evaluate-aggregate.fixtures.js";

const GOOD = ["success", "skipped", "neutral"];

/** Whether one item satisfies its requirement. Written from the item's description, not from the function's rules. */
function satisfied(item: Item, isStatus: boolean): boolean {
	switch (item.kind) {
		case "none":
		case "running":
			return false;
		case "run":
			return GOOD.includes(item.conclusion);
		case "reran":
			return GOOD.includes(item.newer);
		case "pair":
			return item.second !== "running" && GOOD.includes(item.first) && GOOD.includes(item.second);
		case "commit-status":
			return isStatus && item.state === "success";
		case "both":
			return GOOD.includes(item.run);
	}
}

/** The independent oracle: the aggregate may succeed exactly when every id and every context is satisfied. */
export function oracleSucceeds(ids: Item[], contexts: Item[]): boolean {
	if (ids.length === 0) return false;
	return ids.every((item) => satisfied(item, false)) && contexts.every((item) => satisfied(item, true));
}
