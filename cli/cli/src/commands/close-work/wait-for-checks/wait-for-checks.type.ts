import type { PullRequestChecks } from "../../../plugin/index.js";

/** What {@link waitForChecks} needs; the clock and the waiting are injected so a test never sleeps. */
export interface WaitForChecksInput {
	/** Reads the aggregate now. It is called again on every poll, so "green" is never assumed from an earlier read. */
	read: () => Promise<PullRequestChecks>;
	/** Poll until the aggregate has a verdict or the time is up; without it, read once. */
	wait: boolean;
	/** How long polling may last, in milliseconds. */
	timeoutMs: number;
	/** The pause between reads, in milliseconds. */
	intervalMs: number;
	/** The time in milliseconds. */
	now: () => number;
	/** Waits that many milliseconds. */
	sleep: (ms: number) => Promise<void>;
	/** Called after each read that is not the last, so the command can say it is still waiting. */
	onPoll?: (checks: PullRequestChecks, polls: number) => void;
}

/** What {@link waitForChecks} found. */
export interface WaitForChecksResult {
	/** The last read. */
	checks: PullRequestChecks;
	/** Whether polling stopped because the timeout passed with no verdict. */
	timedOut: boolean;
	/** How many reads were made. */
	polls: number;
}
