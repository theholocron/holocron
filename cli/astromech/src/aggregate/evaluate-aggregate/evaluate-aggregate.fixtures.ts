import type { AggregateCheckRun, AggregateCommitStatus, EvaluateAggregateInput } from "./evaluate-aggregate.type.js";

/** How one expected id or status context stands on the commit, described the way a person reads it. */
export type Item =
	| { kind: "none" }
	| { kind: "run"; conclusion: string }
	| { kind: "running" }
	/** An older run and a newer one of the same name (the #2171 case). */
	| { kind: "reran"; older: string; newer: string }
	/** A completed run next to a still-running one under the same id (two names). */
	| { kind: "pair"; first: string; second: "running" | string }
	| { kind: "commit-status"; state: string }
	/** A check run and a commit status for one context: the run wins. */
	| { kind: "both"; run: string; state: string };

export const T0 = Date.parse("2026-11-22T10:00:00Z");
export const TIMEOUT = 30 * 60_000;

export function run(name: string, conclusion: string | null, startedAt: string | null, id: number): AggregateCheckRun {
	return {
		id,
		name,
		status: conclusion === null ? "in_progress" : "completed",
		conclusion,
		startedAt,
		url: `https://example.test/${id}`,
	};
}

let counter = 0;
function next(): number {
	counter += 1;
	return counter;
}

/** Turns items into the runs and commit statuses that produce them. `ids` are expected ids, `contexts` statuses. */
export function build(
	ids: Array<[string, Item]>,
	contexts: Array<[string, Item]>,
	timed: "before" | "after"
): EvaluateAggregateInput {
	const checkRuns: AggregateCheckRun[] = [];
	const commitStatuses: AggregateCommitStatus[] = [];
	const t = (minute: number) => `2026-11-22T10:0${minute}:00Z`;
	for (const [id, item] of ids) {
		const name = `${id} / Conclusion`;
		if (item.kind === "run") checkRuns.push(run(name, item.conclusion, t(1), next()));
		if (item.kind === "running") checkRuns.push(run(name, null, t(1), next()));
		if (item.kind === "reran") {
			checkRuns.push(run(name, item.older, t(1), next()), run(name, item.newer, t(2), next()));
		}
		if (item.kind === "pair") {
			checkRuns.push(
				run(`${id} / a`, item.first, t(1), next()),
				run(`${id} / b`, item.second === "running" ? null : item.second, t(1), next())
			);
		}
	}
	for (const [context, item] of contexts) {
		if (item.kind === "run") checkRuns.push(run(context, item.conclusion, t(1), next()));
		if (item.kind === "running") checkRuns.push(run(context, null, t(1), next()));
		if (item.kind === "reran") {
			checkRuns.push(run(context, item.older, t(1), next()), run(context, item.newer, t(2), next()));
		}
		if (item.kind === "commit-status") {
			commitStatuses.push({ context, state: item.state, url: `https://example.test/s/${next()}` });
		}
		if (item.kind === "both") {
			checkRuns.push(run(context, item.run, t(1), next()));
			commitStatuses.push({ context, state: item.state, url: `https://example.test/s/${next()}` });
		}
	}
	return {
		expected: ids.map(([id]) => id),
		statuses: contexts.map(([context]) => context),
		checkRuns,
		commitStatuses,
		now: timed === "before" ? T0 + TIMEOUT - 1 : T0 + TIMEOUT,
		startedAt: T0,
		timeoutMs: TIMEOUT,
	};
}

const CONCLUSIONS = ["success", "failure", "cancelled", "neutral", "skipped", "timed_out"];

/** The states an expected id can be in. */
export const ID_ITEMS: Item[] = [
	{ kind: "none" },
	...CONCLUSIONS.map((conclusion): Item => ({ kind: "run", conclusion })),
	{ kind: "running" },
	{ kind: "reran", older: "failure", newer: "success" },
	{ kind: "reran", older: "success", newer: "failure" },
	{ kind: "pair", first: "success", second: "running" },
	{ kind: "pair", first: "failure", second: "running" },
	{ kind: "pair", first: "success", second: "success" },
];

/** The states a status context can be in. */
export const STATUS_ITEMS: Item[] = [
	{ kind: "none" },
	{ kind: "run", conclusion: "success" },
	{ kind: "run", conclusion: "failure" },
	{ kind: "run", conclusion: "neutral" },
	{ kind: "running" },
	{ kind: "reran", older: "failure", newer: "success" },
	{ kind: "commit-status", state: "success" },
	{ kind: "commit-status", state: "pending" },
	{ kind: "commit-status", state: "failure" },
	{ kind: "commit-status", state: "error" },
	{ kind: "both", run: "failure", state: "success" },
	{ kind: "both", run: "success", state: "failure" },
];

/** Every combination of items for the given counts of ids and contexts. */
export function crossProduct(idCount: number, statusCount: number): Array<{ ids: Item[]; contexts: Item[] }> {
	const combos = (pool: Item[], count: number): Item[][] =>
		count === 0 ? [[]] : combos(pool, count - 1).flatMap((rest) => pool.map((item) => [item, ...rest]));
	return combos(ID_ITEMS, idCount).flatMap((ids) =>
		combos(STATUS_ITEMS, statusCount).map((contexts) => ({ ids, contexts }))
	);
}

export function inputFor(combo: { ids: Item[]; contexts: Item[] }, timed: "before" | "after"): EvaluateAggregateInput {
	return build(
		combo.ids.map((item, i): [string, Item] => [`task${i}:leaf`, item]),
		combo.contexts.map((item, i): [string, Item] => [`codecov/s${i}`, item]),
		timed
	);
}
