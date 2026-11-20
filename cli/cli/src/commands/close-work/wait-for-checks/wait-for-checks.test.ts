import { describe, expect, it, vi } from "vitest";

import type { PullRequestChecks } from "../../../plugin/index.js";
import { waitForChecks } from "./wait-for-checks.js";

const checks = (state: PullRequestChecks["state"]): PullRequestChecks => ({ state, failing: [] });

/** A clock that only moves when the code sleeps. */
function clock() {
	let t = 0;
	return { now: () => t, sleep: vi.fn(async (ms: number) => void (t += ms)) };
}

describe("waitForChecks", () => {
	it("reads once without wait, whatever the state", async () => {
		const read = vi.fn(async () => checks("pending"));
		const c = clock();
		const result = await waitForChecks({ read, wait: false, timeoutMs: 1000, intervalMs: 10, ...c });
		expect(result).toEqual({ checks: checks("pending"), timedOut: false, polls: 1 });
		expect(c.sleep).not.toHaveBeenCalled();
	});

	it("polls until the aggregate is green, reading it again each time", async () => {
		const states: PullRequestChecks["state"][] = ["none", "pending", "success"];
		const read = vi.fn(async () => checks(states.shift() ?? "success"));
		const c = clock();
		const onPoll = vi.fn();
		const result = await waitForChecks({ read, wait: true, timeoutMs: 1000, intervalMs: 10, onPoll, ...c });
		expect(result).toMatchObject({ timedOut: false, polls: 3, checks: { state: "success" } });
		expect(c.sleep).toHaveBeenCalledTimes(2);
		expect(onPoll).toHaveBeenCalledTimes(2);
	});

	it("stops at once on a red aggregate", async () => {
		const read = vi.fn(async () => ({ state: "failure" as const, failing: [{ name: "lint:code / Conclusion" }] }));
		const c = clock();
		const result = await waitForChecks({ read, wait: true, timeoutMs: 1000, intervalMs: 10, ...c });
		expect(result.polls).toBe(1);
		expect(result.checks.failing).toHaveLength(1);
	});

	it("gives up when the timeout passes, sleeping no longer than what is left", async () => {
		const read = vi.fn(async () => checks("pending"));
		const c = clock();
		const result = await waitForChecks({ read, wait: true, timeoutMs: 25, intervalMs: 10, ...c });
		expect(result).toMatchObject({ timedOut: true, polls: 4 });
		expect(c.sleep.mock.calls.map((call) => call[0])).toEqual([10, 10, 5]);
	});
});
