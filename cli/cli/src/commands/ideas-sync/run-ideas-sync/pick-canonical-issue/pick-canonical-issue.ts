import type { Issue } from "../../../../plugin/index.js";
import { oldestIssueKey } from "../oldest-issue-key/index.js";

/**
 * The issue that stands for an idea among the issues that carry its marker: the oldest open one (by
 * {@link oldestIssueKey}), or, when every one is closed, the oldest of all, because an issue closed on purpose still
 * means the idea was filed. A closed duplicate that a search lists first therefore never replaces the open issue.
 * Returns `undefined` for an empty list.
 */
export function pickCanonicalIssue<T extends Pick<Issue, "key" | "statusCategory">>(hits: readonly T[]): T | undefined {
	const open = hits.filter((issue) => issue.statusCategory !== "done");
	const pool = open.length > 0 ? open : hits;
	const key = oldestIssueKey(pool.map((issue) => issue.key));
	return pool.find((issue) => issue.key === key);
}
