import type { LineHunk } from "./line-hunks.type.js";

/** The most cells of the comparison table that is built; past it the whole differing middle is one hunk. */
const MAX_TABLE_CELLS = 4_000_000;

/**
 * The runs of lines that differ between `original` and `fixed`: a shared start and end are trimmed, then the middle
 * is compared by its longest common subsequence, so two separate edits are two hunks and an edit that moves nothing
 * else stays one. A middle too large to tabulate is one hunk (the caller then takes all of it or none of it).
 */
export function lineHunks(original: string[], fixed: string[]): LineHunk[] {
	let start = 0;
	while (start < original.length && start < fixed.length && original[start] === fixed[start]) start++;
	let originalEnd = original.length;
	let fixedEnd = fixed.length;
	while (originalEnd > start && fixedEnd > start && original[originalEnd - 1] === fixed[fixedEnd - 1]) {
		originalEnd--;
		fixedEnd--;
	}
	if (start === originalEnd && start === fixedEnd) return [];

	const n = originalEnd - start;
	const m = fixedEnd - start;
	if (n === 0 || m === 0 || n * m > MAX_TABLE_CELLS) {
		return [{ from: start, to: originalEnd, fixedFrom: start, fixedTo: fixedEnd }];
	}

	// table[i][j]: the length of the longest common subsequence of original[start+i..] and fixed[start+j..].
	const width = m + 1;
	const table = new Uint32Array((n + 1) * width);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			table[i * width + j] =
				original[start + i] === fixed[start + j]
					? table[(i + 1) * width + j + 1]! + 1
					: Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
		}
	}

	const hunks: LineHunk[] = [];
	let open: LineHunk | undefined;
	let i = 0;
	let j = 0;
	while (i < n || j < m) {
		if (i < n && j < m && original[start + i] === fixed[start + j]) {
			if (open) hunks.push(open);
			open = undefined;
			i++;
			j++;
		} else if (j < m && (i === n || table[i * width + j + 1]! >= table[(i + 1) * width + j]!)) {
			open ??= { from: start + i, to: start + i, fixedFrom: start + j, fixedTo: start + j };
			j++;
			open.fixedTo = start + j;
		} else {
			open ??= { from: start + i, to: start + i, fixedFrom: start + j, fixedTo: start + j };
			i++;
			open.to = start + i;
		}
	}
	/* istanbul ignore else -- the trimmed middle ends where the texts differ, so the walk ends on an insertion or a deletion and a hunk is open */
	if (open) hunks.push(open);
	return hunks;
}
