import { describe, expect, it } from "vitest";

import {
	aggregateChecks,
	CLOSING_QUERY,
	type RawCheckRun,
	type RawClosingPullRequest,
	toBoardPullRequests,
} from "./project-pull-requests.js";

const run = (over: Partial<RawCheckRun> = {}): RawCheckRun => ({
	databaseId: 1,
	status: "COMPLETED",
	conclusion: "SUCCESS",
	startedAt: "2026-11-18T10:00:00Z",
	...over,
});

const LATER = "2026-11-18T11:00:00Z";

describe("aggregateChecks", () => {
	const rows: Array<[string, RawCheckRun[], string]> = [
		["no run posted", [], "none"],
		["completed success", [run()], "success"],
		["completed failure", [run({ conclusion: "FAILURE" })], "failure"],
		["timed out", [run({ conclusion: "TIMED_OUT" })], "failure"],
		["action required", [run({ conclusion: "ACTION_REQUIRED" })], "failure"],
		["in progress", [run({ status: "IN_PROGRESS", conclusion: null })], "pending"],
		["queued", [run({ status: "QUEUED", conclusion: null })], "pending"],
		["cancelled", [run({ conclusion: "CANCELLED" })], "pending"],
		["neutral", [run({ conclusion: "NEUTRAL" })], "none"],
		["skipped", [run({ conclusion: "SKIPPED" })], "none"],
		["completed with no conclusion", [run({ conclusion: null })], "none"],
		[
			"the newest run wins over an older failure",
			[run({ databaseId: 1, conclusion: "FAILURE" }), run({ databaseId: 2, startedAt: LATER })],
			"success",
		],
		[
			"the newest run wins over an older success",
			[run({ databaseId: 1 }), run({ databaseId: 2, startedAt: LATER, status: "IN_PROGRESS", conclusion: null })],
			"pending",
		],
		[
			"the id breaks a tie in time",
			[run({ databaseId: 1 }), run({ databaseId: 2, conclusion: "FAILURE" })],
			"failure",
		],
		[
			"a run with no start time loses to one with it",
			[run({ databaseId: 9, startedAt: null, conclusion: "FAILURE" }), run({ databaseId: 1 })],
			"success",
		],
		[
			"a run with no start time loses whichever side it is listed on",
			[run({ databaseId: 1 }), run({ databaseId: 9, startedAt: null, conclusion: "FAILURE" })],
			"success",
		],
		[
			"two runs with no start time fall back to the id",
			[
				run({ databaseId: 1, startedAt: null }),
				run({ databaseId: 2, startedAt: null, conclusion: "FAILURE" }),
				run({ databaseId: 3, startedAt: null }),
			],
			"success",
		],
	];
	it.each(rows)("%s", (_name, runs, expected) => {
		expect(aggregateChecks(runs)).toBe(expected);
	});
});

describe("toBoardPullRequests", () => {
	const keyOf = (repo: string, n: number) => (repo === "o/r" ? `#${n}` : `${repo}#${n}`);
	const node = (over: Partial<RawClosingPullRequest> = {}): RawClosingPullRequest => ({
		number: 7,
		state: "OPEN",
		isDraft: false,
		repository: { nameWithOwner: "o/r" },
		commits: {
			nodes: [
				{
					commit: {
						checkSuites: { nodes: [{ checkRuns: { nodes: [run()] } }, { checkRuns: { nodes: [] } }] },
					},
				},
			],
		},
		...over,
	});

	it("maps state, draft and the aggregate verdict across the commit's suites, keyed like items", () => {
		expect(
			toBoardPullRequests(
				[
					node(),
					node({ number: 8, isDraft: true, repository: { nameWithOwner: "x/y" }, commits: { nodes: [] } }),
				],
				keyOf
			)
		).toEqual([
			{ key: "#7", state: "open", draft: false, checks: "success" },
			{ key: "x/y#8", state: "open", draft: true, checks: "none" },
		]);
	});

	it("does not read the checks of a merged or closed pull request", () => {
		expect(toBoardPullRequests([node({ state: "MERGED" }), node({ state: "CLOSED", number: 9 })], keyOf)).toEqual([
			{ key: "#7", state: "merged", draft: false, checks: "none" },
			{ key: "#9", state: "closed", draft: false, checks: "none" },
		]);
	});

	it("reads a node with no commits as no check", () => {
		expect(toBoardPullRequests([node({ commits: undefined })], keyOf)[0]?.checks).toBe("none");
	});

	it("filters the check runs by the aggregate's name", () => {
		expect(CLOSING_QUERY).toContain('checkName: "ci / Required checks"');
	});
});
