/** What {@link retryWithWait} takes. */
export interface RetryWithWaitInput<T> {
	/** One try; `n` counts from 1. A rejection is a failed try. Fetch a fresh credential in here, not before the loop. */
	attempt: (n: number) => Promise<T>;
	/** How many tries in all. */
	attempts: number;
	/** How long to wait, in milliseconds, after try `n` failed. */
	waitMs: (n: number) => number;
	/** Waits. */
	sleep: (ms: number) => Promise<void>;
	/** Called after a failed try that will be followed by another, before the wait. */
	onRetry?: (n: number, error: unknown, waitMs: number) => void;
}

/** Runs `attempt` until it resolves or `attempts` tries have failed, waiting between tries; rethrows the last failure. */
export async function retryWithWait<T>(input: RetryWithWaitInput<T>): Promise<T> {
	for (let n = 1; ; n++) {
		try {
			return await input.attempt(n);
		} catch (error) {
			if (n >= input.attempts) throw error;
			const wait = input.waitMs(n);
			input.onRetry?.(n, error, wait);
			await input.sleep(wait);
		}
	}
}
