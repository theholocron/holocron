import type { AggregateCheckRun } from "../evaluate-aggregate/evaluate-aggregate.type.js";

/**
 * Keeps only the newest run of each check name, ordered by name. A commit can carry several runs of one check (a
 * cancelled first batch, a job re-run to green): the newest is the one that counts (latest `startedAt`, then `id`, #2171).
 * The sort key is the one the `ci` workflow's jq program uses.
 */
export function newestCheckRuns(runs: AggregateCheckRun[]): AggregateCheckRun[] {
	const byName = new Map<string, AggregateCheckRun>();
	for (const run of runs) {
		const kept = byName.get(run.name);
		if (kept === undefined || isNewer(run, kept)) byName.set(run.name, run);
	}
	return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function isNewer(a: AggregateCheckRun, b: AggregateCheckRun): boolean {
	const aStart = a.startedAt ?? "";
	const bStart = b.startedAt ?? "";
	if (aStart !== bStart) return aStart > bStart;
	// Equal keys keep the first one, as a stable sort followed by `last` would keep the last: the later one wins a tie.
	return (a.id ?? 0) >= (b.id ?? 0);
}
