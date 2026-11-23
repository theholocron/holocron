/** A check run on the head commit, in the plain shape the aggregate needs (no GitHub types). */
export interface AggregateCheckRun {
	id: number | null;
	name: string;
	/** `completed`, or anything else (`queued`, `in_progress`) for a run that is still going. */
	status: string;
	/** The run's conclusion; `null` while it is not completed. */
	conclusion: string | null;
	/** ISO 8601 time the run started, `null` when GitHub has not set one. */
	startedAt: string | null;
	url: string | null;
}

/** A commit status on the head commit. */
export interface AggregateCommitStatus {
	context: string;
	/** `success`, `pending`, `failure` or `error`. */
	state: string;
	url: string | null;
}

/** Everything {@link evaluateAggregate} reads. All of it comes from the API, never from a webhook payload. */
export interface EvaluateAggregateInput {
	/** Check ids: each needs a check run named `<id> / ...`. */
	expected: string[];
	/** Contexts that must reach success, as a check run named like the context, else as a commit status. */
	statuses: string[];
	checkRuns: AggregateCheckRun[];
	/** The commit statuses, newest first as the API returns them; the first match for a context counts. */
	commitStatuses: AggregateCommitStatus[];
	/** The current time in epoch milliseconds. */
	now: number;
	/** When the aggregate began waiting for this commit, in epoch milliseconds. */
	startedAt: number;
	/** How long to wait before a pending or missing check becomes a failure. */
	timeoutMs: number;
	/**
	 * Set when the state could not be read in full (the list was truncated, a read failed): the reason. The result is
	 * then never `success`.
	 */
	incomplete?: string;
}

/** One line of the aggregate: an expected check id or a status context. */
export interface AggregateRow {
	id: string;
	/** `check` for an expected id, `status` for a status context, `config` for a problem with the inputs. */
	kind: "check" | "status" | "config";
	state: "success" | "failure" | "pending" | "missing";
	/** What the check said: its conclusion, `still running`, `never posted`, ... */
	detail: string;
	url: string | null;
}

/** One error line for a failing row. */
export interface AggregateAnnotation {
	title: string;
	message: string;
}

/** The verdict. `pending` means "ask again later"; only `success` lets a pull request merge. */
export interface AggregateResult {
	conclusion: "pending" | "success" | "failure";
	rows: AggregateRow[];
	/** The failing-first table of every row, as Markdown. */
	summary: string;
	annotations: AggregateAnnotation[];
}
