import type { CheckRow } from "@theholocron/kyber/ui";

import type { BoardItem } from "../../plugin/index.js";

const RULES: { id: string; label: string; test: (item: BoardItem) => boolean }[] = [
	{ id: "no-status", label: "item without a status", test: (i) => i.status === undefined },
	{
		id: "closed-not-done",
		label: "closed item not in a done status",
		test: (i) => !i.open && i.status !== undefined && i.category !== "done",
	},
	{
		id: "blocker-not-blocked",
		label: "open item with an open blocker but not in a blocked status",
		test: (i) => i.open && i.blockedBy.length > 0 && i.category !== "blocked",
	},
	{
		id: "blocked-no-blocker",
		label: "blocked item with no open blocker",
		test: (i) => i.open && i.category === "blocked" && i.blockedBy.length === 0,
	},
];

/**
 * One row per rule `project reconcile` fixes, over the board's items. The doctor only reports: a rule with items is an
 * `info` row (counted as skipped, never a failure) listing them, and a clean one is `ok`.
 */
export function itemRows(boardName: string, items: readonly BoardItem[]): CheckRow[] {
	return RULES.map(({ id, label, test }) => {
		const hits = items.filter(test);
		const title = `${boardName}: ${label}`;
		return hits.length === 0
			? { id: `project:${boardName}:${id}`, title, status: "ok", detail: "none", problems: [] }
			: {
					id: `project:${boardName}:${id}`,
					title,
					status: "skip",
					detail: `info: ${hits.length} item(s); \`project reconcile\` fixes this`,
					problems: hits.map((i) => `${i.key} ${i.title}`),
				};
	});
}
