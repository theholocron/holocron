import type {
	AggregateCheckRun,
	AggregateCommitStatus,
	AggregateResult,
} from "../evaluate-aggregate/evaluate-aggregate.type.js";

/** The name of the aggregate check run, the one context the ruleset requires. */
export const AGGREGATE_CHECK_NAME = "ci / Required checks";

/** How long the aggregate waits for a check that has not finished or not posted, as the polling job does. */
export const AGGREGATE_TIMEOUT_MS = 30 * 60_000;

/** What one write puts on the aggregate check run. */
export interface AggregateWrite {
	/** `in_progress` while a check can still change, `completed` once the verdict is final. */
	status: "in_progress" | "completed";
	/** The verdict; only set when `status` is `completed`. */
	conclusion?: "success" | "failure" | "neutral";
	/** The check run's title. */
	title: string;
	/** The failing-first Markdown table. */
	summary: string;
	/** One line per failing row, for the run's details; empty when nothing failed. */
	text: string;
	/** ISO time the aggregate began waiting, set when the run is created. */
	startedAt?: string;
}

/**
 * The four calls {@link postAggregate} needs. Sentinel backs them with `@theholocron/github-client`, the CLI with the
 * `source` provider, and the tests with a fake, so the one function serves all three.
 */
export interface AggregateApi {
	/** Every check run on the commit, the aggregate's own included. */
	listCheckRuns(sha: string): Promise<AggregateCheckRun[]>;
	/** The commit statuses on the commit, newest first. */
	listCommitStatuses(sha: string): Promise<AggregateCommitStatus[]>;
	/** Creates the aggregate check run and returns its id. */
	createCheckRun(sha: string, name: string, write: AggregateWrite): Promise<number>;
	/** Changes one run the aggregate made. A provider that refuses (a completed run cannot reopen) throws. */
	updateCheckRun(id: number, write: AggregateWrite): Promise<void>;
}

/** What {@link postAggregate} reads and decides with. */
export interface PostAggregateInput {
	/** The provider calls. */
	api: AggregateApi;
	/** The commit to post on. */
	sha: string;
	/** The expected check ids, from the config at the pull request's base ref. */
	expected: string[];
	/** The status contexts that must reach success. */
	statuses: string[];
	/** The current time in epoch milliseconds. */
	now: number;
	/** The name to post under; defaults to {@link AGGREGATE_CHECK_NAME}. */
	name?: string;
	/** How long to wait before a pending or missing check fails; defaults to {@link AGGREGATE_TIMEOUT_MS}. */
	timeoutMs?: number;
	/** Read and decide, write nothing. */
	dryRun?: boolean;
	/** Write again even when the status and conclusion already match, so the table stays current (a webhook). */
	refreshOutput?: boolean;
	/** An `in_progress` run older than this many milliseconds counts as stale; defaults to 10 minutes. */
	graceMs?: number;
}

/** What {@link postAggregate} did. */
export interface PostAggregateResult {
	/** `created` or `updated` a run, `recreated` when the provider refused to reopen one, `unchanged`, or `would-...` on a dry run. */
	action: "created" | "updated" | "recreated" | "unchanged" | "would-create" | "would-update";
	/** The verdict the state calls for. */
	result: AggregateResult;
	/** True when the stored run was missing or disagreed with the verdict, and had been waiting longer than the grace. */
	stale: boolean;
	/** The id of the run the verdict is on, `null` on a dry run that would create one. */
	runId: number | null;
	/** Ids of duplicate runs a race left, completed as `neutral`. */
	closed: number[];
	/** True when the verdict changed under the write and a second write corrected it. */
	rewritten: boolean;
}
