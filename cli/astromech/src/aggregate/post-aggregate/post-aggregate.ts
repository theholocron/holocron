import { evaluateAggregate } from "../evaluate-aggregate/evaluate-aggregate.js";
import type { AggregateCheckRun, AggregateResult } from "../evaluate-aggregate/evaluate-aggregate.type.js";
import { newestCheckRuns } from "../newest-check-runs/index.js";
import {
	AGGREGATE_CHECK_NAME,
	AGGREGATE_TIMEOUT_MS,
	type AggregateWrite,
	type PostAggregateInput,
	type PostAggregateResult,
} from "./post-aggregate.type.js";

const DEFAULT_GRACE_MS = 10 * 60_000;

const asWrite = (result: AggregateResult, startedAt?: string): AggregateWrite => ({
	status: result.conclusion === "pending" ? "in_progress" : "completed",
	...(result.conclusion === "pending" ? {} : { conclusion: result.conclusion }),
	title:
		result.conclusion === "success"
			? "All required checks passed"
			: result.conclusion === "failure"
				? "Required checks failed"
				: "Waiting for required checks",
	summary: result.summary,
	text: result.annotations.map((a) => `${a.title}: ${a.message}`).join("\n"),
	...(startedAt === undefined ? {} : { startedAt }),
});

const startMs = (run: AggregateCheckRun): number => (run.startedAt === null ? Number.NaN : Date.parse(run.startedAt));

/** Whether the stored run already says what the verdict says. */
function matches(stored: AggregateCheckRun, result: AggregateResult): boolean {
	if (result.conclusion === "pending") return stored.status !== "completed";
	return stored.status === "completed" && stored.conclusion === result.conclusion;
}

/**
 * Computes the `ci` aggregate for one commit from the state the API holds and makes the check run say it. This is the
 * one writer: Sentinel's webhook handler, the `reconcile ci` command and the scheduled sweep all call it, so a verdict
 * is the same whoever asks.
 *
 * Every call reads the whole state again (the payload of a webhook is never used), finds the aggregate's run by name
 * and updates it, or creates one when there is none. After a create it lists the runs again and, when two writers
 * raced, keeps the oldest and completes the others as `neutral`. After every write it reads once more and writes
 * again if the verdict moved, so a slow older computation cannot leave a stale `in_progress` over a `success`.
 */
export async function postAggregate(input: PostAggregateInput): Promise<PostAggregateResult> {
	const name = input.name ?? AGGREGATE_CHECK_NAME;
	const timeoutMs = input.timeoutMs ?? AGGREGATE_TIMEOUT_MS;
	const graceMs = input.graceMs ?? DEFAULT_GRACE_MS;
	const expected = input.expected.filter((id) => id !== "ci");

	const read = async () => {
		const [runs, commitStatuses] = await Promise.all([
			input.api.listCheckRuns(input.sha),
			input.api.listCommitStatuses(input.sha),
		]);
		const own = runs.filter((run) => run.name === name);
		const first = own
			.map(startMs)
			.filter((ms) => !Number.isNaN(ms))
			.sort((a, b) => a - b)[0];
		const startedAt = first ?? input.now;
		const result = evaluateAggregate({
			expected,
			statuses: input.statuses,
			checkRuns: runs.filter((run) => run.name !== name),
			commitStatuses,
			now: input.now,
			startedAt,
			timeoutMs,
		});
		return { own, stored: newestCheckRuns(own)[0], startedAt, result };
	};

	const state = await read();
	const { stored, result } = state;
	const waited = input.now - state.startedAt;
	const stale =
		stored === undefined
			? true
			: !matches(stored, result) && (stored.status !== "completed" ? waited > graceMs : true);
	const needsWrite = stored === undefined || !matches(stored, result) || input.refreshOutput === true;
	const base = { result, stale, closed: [] as number[], rewritten: false };

	if (!needsWrite) return { ...base, action: "unchanged", runId: stored.id }; // a run that matches exists
	if (input.dryRun) {
		return stored === undefined
			? { ...base, action: "would-create", runId: null }
			: { ...base, action: "would-update", runId: stored.id as number };
	}

	let action: PostAggregateResult["action"];
	let runId: number;
	const closed: number[] = [];
	if (stored === undefined) {
		runId = await input.api.createCheckRun(input.sha, name, asWrite(result, new Date(input.now).toISOString()));
		action = "created";
		// Two deliveries can both find no run and both create one: keep the oldest, complete the rest.
		const after = await input.api.listCheckRuns(input.sha);
		// A run an earlier convergence completed as neutral is already settled and never canonical.
		const mine = after.flatMap((run) =>
			run.name === name && run.id !== null && !(run.status === "completed" && run.conclusion === "neutral")
				? [{ ...run, id: run.id }]
				: []
		);
		if (mine.length > 1) {
			const ordered = [...mine].sort(
				(a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? "") || a.id - b.id
			);
			runId = ordered[0]?.id; // `mine` has more than one run
			for (const extra of ordered.slice(1)) {
				await input.api.updateCheckRun(extra.id, {
					status: "completed",
					conclusion: "neutral",
					title: "Duplicate of the canonical aggregate",
					summary:
						"Another delivery posted this check at the same time; the oldest run is the one that counts.",
					text: "",
				});
				closed.push(extra.id);
			}
		}
	} else {
		runId = stored.id as number; // the run came from the provider's own list, so it has an id
		try {
			await input.api.updateCheckRun(runId, asWrite(result));
			action = "updated";
		} catch (error) {
			// A completed run may not reopen; make a new one, which then is the newest and so the one that counts.
			if (stored.status !== "completed" || result.conclusion !== "pending") throw error;
			runId = await input.api.createCheckRun(input.sha, name, asWrite(result, new Date(input.now).toISOString()));
			action = "recreated";
		}
	}

	// Verify after write: if the state moved under us, say the new verdict once.
	let rewritten = false;
	const again = await read();
	if (again.result.conclusion !== result.conclusion) {
		await input.api.updateCheckRun(runId, asWrite(again.result));
		rewritten = true;
		return { action, result: again.result, stale, runId, closed, rewritten };
	}
	return { action, result, stale, runId, closed, rewritten };
}
