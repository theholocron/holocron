import type { WaitForChecksInput, WaitForChecksResult } from "./wait-for-checks.type.js";

/**
 * Reads the aggregate check and, with `wait`, keeps reading until it is green or red or the timeout passes. A red
 * aggregate stops the wait at once (waiting cannot turn it green; a re-run is a new run the next read would see), and
 * `pending` and `none` (not posted yet) are waited on. Without `wait` it reads once.
 */
export async function waitForChecks(input: WaitForChecksInput): Promise<WaitForChecksResult> {
	const started = input.now();
	let polls = 0;
	for (;;) {
		const checks = await input.read();
		polls += 1;
		if (checks.state === "success" || checks.state === "failure" || !input.wait) {
			return { checks, timedOut: false, polls };
		}
		const left = input.timeoutMs - (input.now() - started);
		if (left <= 0) return { checks, timedOut: true, polls };
		input.onPoll?.(checks, polls);
		await input.sleep(Math.min(input.intervalMs, left));
	}
}
