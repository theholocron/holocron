import type { ImportResult } from "../../../plugin/index.js";

/** What did not carry across, and for how many issues. */
export interface DroppedTally {
	/** What was left out, with issue keys folded to `…` so the same loss on many issues counts once. */
	what: string;
	/** How many issues lost it. */
	count: number;
}

/** Folds every result's `dropped` lines into counts, most common first, so a migration prints each loss once. */
export function tallyDropped(results: readonly ImportResult[]): DroppedTally[] {
	const counts = new Map<string, number>();
	for (const result of results) {
		for (const line of new Set(result.dropped.map((d) => d.replace(/#\d+|\b[A-Z][A-Z0-9]*-\d+\b/g, "…")))) {
			counts.set(line, (counts.get(line) ?? 0) + 1);
		}
	}
	return [...counts]
		.map(([what, count]) => ({ what, count }))
		.sort((a, b) => b.count - a.count || a.what.localeCompare(b.what));
}
