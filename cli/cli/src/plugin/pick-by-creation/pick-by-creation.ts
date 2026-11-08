import type { IssueOrder } from "../capabilities/index.js";

/**
 * Keeps the first or last `limit` of a listing by creation time, returned oldest first. `createdAt` reads an item's
 * ISO timestamp; items created in the same instant keep their listed order. The cut happens on what the listing already
 * holds, so no request is spent on an item that is dropped.
 */
export function pickByCreation<T>(
	items: readonly T[],
	createdAt: (item: T) => string,
	order: IssueOrder,
	limit: number
): T[] {
	const ascending = items
		.map((item, index) => ({ item, index, at: Date.parse(createdAt(item)) }))
		.sort((a, b) => a.at - b.at || a.index - b.index)
		.map((e) => e.item);
	return order === "newest" ? ascending.slice(Math.max(ascending.length - limit, 0)) : ascending.slice(0, limit);
}
