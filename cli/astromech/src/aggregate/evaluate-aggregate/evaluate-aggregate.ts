import { newestCheckRuns } from "../newest-check-runs/index.js";
import { renderAggregate } from "../render-aggregate/index.js";
import type {
	AggregateCheckRun,
	AggregateResult,
	AggregateRow,
	EvaluateAggregateInput,
} from "./evaluate-aggregate.type.js";

const PASSING = new Set(["success", "skipped", "neutral"]);

function passes(conclusion: string | null): boolean {
	return PASSING.has(conclusion ?? "");
}

function row(id: string, kind: AggregateRow["kind"], state: AggregateRow["state"], detail: string, url: string | null) {
	return { id, kind, state, detail, url } satisfies AggregateRow;
}

function checkRow(id: string, latest: AggregateCheckRun[]): AggregateRow {
	const found = latest.filter((run) => run.name.startsWith(`${id} / `));
	if (found.length === 0) return row(id, "check", "missing", "never posted", null);
	const open = found.find((run) => run.status !== "completed");
	if (open !== undefined) return row(id, "check", "pending", "still running", open.url);
	const bad = found.find((run) => !passes(run.conclusion));
	if (bad !== undefined) return row(id, "check", "failure", bad.conclusion ?? "none", bad.url);
	return row(id, "check", "success", found[0]?.conclusion ?? "none", found[0]?.url ?? null);
}

function statusRow(context: string, latest: AggregateCheckRun[], input: EvaluateAggregateInput): AggregateRow {
	// A coverage service posts a check run named like the context; a commit status is the fallback, so either counts.
	const run = latest.find((candidate) => candidate.name === context);
	if (run !== undefined) {
		if (run.status !== "completed") return row(context, "status", "pending", "still running", run.url);
		if (passes(run.conclusion)) return row(context, "status", "success", run.conclusion ?? "none", run.url);
		return row(context, "status", "failure", run.conclusion ?? "none", run.url);
	}
	const posted = input.commitStatuses.find((status) => status.context === context);
	if (posted === undefined) return row(context, "status", "missing", "never posted", null);
	if (posted.state === "pending") return row(context, "status", "pending", "still pending", posted.url);
	if (posted.state === "success") return row(context, "status", "success", "success", posted.url);
	return row(context, "status", "failure", posted.state, posted.url);
}

/**
 * Decides the `ci` aggregate check for one commit from the state read from the API.
 *
 * Pure: no clock, no network, no GitHub types. It fails closed: `success` only when every expected id and every status
 * context is satisfied, so an empty `expected`, an `incomplete` read or an unreadable clock never yields `success`.
 * `pending` means a check is still running or has not posted and the deadline (`startedAt + timeoutMs`) has not passed;
 * at the deadline pending and missing rows become failures.
 */
export function evaluateAggregate(input: EvaluateAggregateInput): AggregateResult {
	const latest = newestCheckRuns(input.checkRuns);
	const raw = [
		...input.expected.map((id) => checkRow(id, latest)),
		...input.statuses.map((context) => statusRow(context, latest, input)),
	];
	// A deadline that cannot be computed counts as passed: waiting forever is not safe.
	const elapsed = input.now - input.startedAt;
	const expired = !(elapsed < input.timeoutMs);
	const rows = raw.map((r) => {
		if (!expired) return r;
		if (r.state === "pending") return { ...r, state: "failure" as const, detail: "timed out while still running" };
		if (r.state === "missing") return { ...r, state: "failure" as const };
		return r;
	});
	if (input.expected.length === 0) {
		rows.unshift(row("expected", "config", "failure", "no expected checks are configured", null));
	}
	if (input.incomplete !== undefined) {
		rows.unshift(row("checks", "config", "failure", `state not read in full: ${input.incomplete}`, null));
	}
	const settled = rows.every((r) => r.state === "success" || r.state === "failure");
	const conclusion = rows.every((r) => r.state === "success") ? "success" : settled ? "failure" : "pending";
	return { conclusion, rows, ...renderAggregate(rows) };
}
