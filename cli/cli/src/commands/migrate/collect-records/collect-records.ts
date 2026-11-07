import { describeError } from "@theholocron/kyber/ui";

import type { BoardItem, BoardStatusCategory, IssueRecord, StatusCategory } from "../../../plugin/index.js";
import type { Collected, CollectInput } from "./collect-records.type.js";

/** An empty template: a board's items are read for their keys, status and priority, not judged against statuses. */
const NO_TEMPLATE = { name: "migrate", statuses: [], fields: [], views: [] };

const CATEGORY: Record<BoardStatusCategory, StatusCategory> = {
	backlog: "open",
	planned: "open",
	active: "in-progress",
	blocked: "in-progress",
	done: "done",
};

/**
 * Reads the records a scope names from the source: one issue, a selection, or every item of a board. A board's items
 * are read through the `projects` provider and then exported by key; the board's status and priority are laid over
 * the record because on a board they belong to the item, not the issue.
 */
export async function collectRecords(input: CollectInput): Promise<Collected> {
	const { source, scope } = input;
	const issues = source.issues;
	if (!issues?.export) {
		return { ok: false, reason: `the \`${source.provider}\` provider cannot export issues` };
	}
	try {
		if (scope.kind === "issue") {
			return { ok: true, records: await issues.export({ keys: [scope.key] }), notes: [] };
		}
		if (scope.kind === "issues") {
			return {
				ok: true,
				records: await issues.export({ ...scope.selector, ...(input.openOnly ? { openOnly: true } : {}) }),
				notes: [],
			};
		}

		const projects = source.projects;
		if (!projects?.items) {
			return { ok: false, reason: `the \`${source.provider}\` provider cannot list the items of a board` };
		}
		const board =
			(await projects.find(scope.owner, scope.name)) ??
			(await projects.list(scope.owner)).find((b) => b.name === scope.name);
		if (!board) return { ok: false, reason: `no board named "${scope.name}" in ${source.provider}` };

		const items = (await projects.items(scope.owner, board, NO_TEMPLATE)).filter((i) => !input.openOnly || i.open);
		const local = items.filter((i) => !i.key.includes("/"));
		const notes =
			items.length > local.length
				? [`${items.length - local.length} item(s) from other repositories were skipped`]
				: [];
		const byKey = new Map<string, BoardItem>(local.map((i) => [i.key, i]));
		const records = await issues.export({ keys: local.map((i) => i.key) });
		return { ok: true, records: records.map((r) => overlay(r, byKey.get(r.key))), notes };
	} catch (err) {
		return { ok: false, reason: describeError(err) };
	}
}

function overlay(record: IssueRecord, item: BoardItem | undefined): IssueRecord {
	if (!item) return record;
	return {
		...record,
		...(item.status ? { status: item.status } : {}),
		...(item.category && !record.closed ? { statusCategory: CATEGORY[item.category] } : {}),
		...(!record.priority && item.priority ? { priority: item.priority } : {}),
	};
}
