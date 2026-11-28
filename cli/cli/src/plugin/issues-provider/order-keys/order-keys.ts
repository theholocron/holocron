import type { IssueOrder } from "../../capabilities/index.js";

/**
 * Puts issue keys in creation order without asking the tracker: issue numbers (`#12`, `ENG-12`) rise with creation inside
 * one repository or team, so the trailing number is the order. `oldest` is ascending, `newest` descending; keys with the
 * same number keep their place. A key with no trailing number is an error, because nothing can be said of its age.
 */
export function orderKeys(keys: readonly string[], order: IssueOrder): string[] {
	const numbered = keys.map((key, index) => {
		const trimmed = key.trimEnd();
		let start = trimmed.length;
		while (start > 0 && trimmed[start - 1] >= "0" && trimmed[start - 1] <= "9") start -= 1;
		if (start === trimmed.length) throw new Error(`Cannot order "${key}" by creation: it has no issue number.`);
		return { key, index, n: Number(trimmed.slice(start)) };
	});
	const sign = order === "newest" ? -1 : 1;
	return numbered.sort((a, b) => sign * (a.n - b.n) || a.index - b.index).map((e) => e.key);
}
