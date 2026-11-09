import type { IssueOrder } from "../../capabilities/index.js";

/**
 * Puts issue keys in creation order without asking the tracker: issue numbers (`#12`, `ENG-12`) rise with creation inside
 * one repository or team, so the trailing number is the order. `oldest` is ascending, `newest` descending; keys with the
 * same number keep their place. A key with no trailing number is an error, because nothing can be said of its age.
 */
export function orderKeys(keys: readonly string[], order: IssueOrder): string[] {
	const numbered = keys.map((key, index) => {
		const match = /(\d+)\s*$/.exec(key);
		if (!match) throw new Error(`Cannot order "${key}" by creation: it has no issue number.`);
		return { key, index, n: Number(match[1]) };
	});
	const sign = order === "newest" ? -1 : 1;
	return numbered.sort((a, b) => sign * (a.n - b.n) || a.index - b.index).map((e) => e.key);
}
