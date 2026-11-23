import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { SourceCheckRun } from "../../plugin/index.js";
import { fakeLoader, loadedWith } from "../migrate/migrate.testing.js";
import { runDoctorCi } from "./doctor-ci.js";
import { readShadowSamples, SHADOW_CHECK_NAME } from "./read-shadow-samples.js";
import { SHADOW_AGREEMENT_TARGET, type ShadowSample } from "./shadow.type.js";
import { shadowRow } from "./shadow-row.js";
import { shadowVerdict } from "./shadow-verdict.js";

const run = (
	name: string,
	conclusion: string | null,
	id: number,
	startedAt: string | null = "2026-11-22T10:00:00Z"
): SourceCheckRun => ({
	id,
	name,
	status: conclusion === null ? "in_progress" : "completed",
	conclusion,
	startedAt,
	url: null,
});

describe("shadowVerdict", () => {
	it("is the newest run's verdict: running is pending, success is success, anything else is failure", () => {
		expect(shadowVerdict([run("ci / Required checks", null, 1)], "ci / Required checks")).toBe("pending");
		expect(shadowVerdict([run("ci / Required checks", "success", 1)], "ci / Required checks")).toBe("success");
		expect(shadowVerdict([run("ci / Required checks", "cancelled", 1)], "ci / Required checks")).toBe("failure");
	});

	it("prefers the later start, then the higher id, and reads no other name", () => {
		const runs = [
			run("ci / Required checks", "failure", 1, "2026-11-22T10:00:00Z"),
			run("ci / Required checks", "success", 2, "2026-11-22T10:05:00Z"),
			run("other", "failure", 9, "2026-11-22T10:09:00Z"),
		];
		expect(shadowVerdict(runs, "ci / Required checks")).toBe("success");
		const tie = [run("a", "failure", 1, null), run("a", "success", 2, null), run("a", "failure", 0, null)];
		expect(shadowVerdict(tie, "a")).toBe("success");
		// A run with no id counts as 0, so the run with an id wins a tie on start.
		expect(shadowVerdict([{ ...run("a", "success", 1, null), id: null }, run("a", "failure", 1, null)], "a")).toBe(
			"failure"
		);
		expect(shadowVerdict(runs, "nothing")).toBeUndefined();
	});
});

const agree = (n: number): ShadowSample => ({ number: n, actions: "success", sentinel: "success" });

describe("shadowRow", () => {
	it("is a skip when no pull request has a finished verdict from both", () => {
		expect(shadowRow([]).status).toBe("skip");
		const undecided: ShadowSample[] = [
			{ number: 1, actions: "success" },
			{ number: 2, sentinel: "success" },
			{ number: 3, actions: "pending", sentinel: "success" },
			{ number: 4, actions: "success", sentinel: "pending" },
		];
		expect(shadowRow(undecided)).toMatchObject({
			status: "skip",
			detail: expect.stringContaining("no pull request"),
		});
	});

	it("fails and names every decided pull request where the two differ", () => {
		const row = shadowRow([
			agree(5),
			{ number: 4, actions: "success", sentinel: "failure" },
			{ number: 3, actions: "failure", sentinel: "success" },
		]);
		expect(row.status).toBe("fail");
		expect(row.detail).toBe("2 of 3 decided pull requests disagree");
		expect(row.problems).toEqual([
			"#4: Actions said success, the shadow said failure",
			"#3: Actions said failure, the shadow said success",
		]);
	});

	it("is a skip below the target and ok at it, ignoring the pull requests still running", () => {
		const few = shadowRow([agree(3), agree(2), { number: 1, actions: "pending", sentinel: "success" }]);
		expect(few).toMatchObject({ status: "skip", detail: "2 of 20 consecutive pull requests agree so far" });
		const many = Array.from({ length: SHADOW_AGREEMENT_TARGET }, (_, i) => agree(100 - i));
		expect(shadowRow(many)).toMatchObject({
			status: "ok",
			detail: "20 consecutive pull requests agree (target 20)",
		});
		expect(shadowRow(many, 5).detail).toContain("target 5");
	});
});

const pr = (number: number, headSha: string | undefined, over: Record<string, unknown> = {}) => ({
	number,
	title: "t",
	state: "open" as const,
	merged: false,
	branch: `b${number}`,
	...(headSha === undefined ? {} : { headSha }),
	url: "u",
	...over,
});

function fakeSource() {
	const byCommit: Record<string, SourceCheckRun[]> = {
		s4: [run("ci / Required checks", "success", 1), run(SHADOW_CHECK_NAME, "success", 2)],
		s3: [run("ci / Required checks", "failure", 3)],
		s2: [run(SHADOW_CHECK_NAME, null, 4)],
	};
	return {
		providerName: "github",
		listPullRequests: vi.fn(async (state: string) =>
			state === "open"
				? [pr(4, "s4"), pr(5, undefined)]
				: [
						pr(3, "s3", { state: "closed", merged: true }),
						pr(2, "s2", { state: "closed", merged: true }),
						pr(1, "s1", { state: "closed" }),
					]
		),
		listCheckRuns: vi.fn(async (sha: string) => byCommit[sha] ?? []),
	};
}

describe("readShadowSamples", () => {
	it("reads the open and merged pull requests newest first, skipping the unmerged and those with no head commit", async () => {
		const source = fakeSource();
		const samples = await readShadowSamples(source);
		expect(samples).toEqual([
			{ number: 4, actions: "success", sentinel: "success" },
			{ number: 3, actions: "failure" },
			{ number: 2, sentinel: "pending" },
		]);
		expect(source.listCheckRuns).toHaveBeenCalledTimes(3);
	});

	it("reads at most `limit` of them", async () => {
		expect(await readShadowSamples(fakeSource(), 1)).toEqual([
			{ number: 4, actions: "success", sentinel: "success" },
		]);
	});
});

describe("doctor ci --shadow", () => {
	const input = (over: Record<string, unknown> = {}) => {
		const lines: string[] = [];
		return {
			lines,
			input: {
				loaded: loadedWith({ source: "github" }),
				context: { repoRoot: "/tmp/repo" },
				io: { workflows: () => [] },
				legacyGate: false,
				print: (line: string) => lines.push(stripVTControlCharacters(line)),
				shadow: true,
				...over,
			},
		};
	};

	it("adds the shadow row to the report", async () => {
		const { input: i, lines } = input({ loader: fakeLoader({ source: fakeSource() }) });
		const report = await runDoctorCi(i as never);
		expect(report.rows.at(-1)).toMatchObject({ id: "shadow", status: "skip" });
		expect(lines.join("\n")).toContain("1 of 20 consecutive pull requests agree so far");
	});

	it("does not read anything without --shadow", async () => {
		const source = fakeSource();
		const { input: i } = input({ loader: fakeLoader({ source }), shadow: undefined });
		const report = await runDoctorCi(i as never);
		expect(report.rows.some((r) => r.id === "shadow")).toBe(false);
		expect(source.listPullRequests).not.toHaveBeenCalled();
	});

	it("is a failing row for every setup problem, never a throw", async () => {
		const noSource = await runDoctorCi(input({ loaded: loadedWith({}) }).input as never);
		expect(noSource.rows.at(-1)).toMatchObject({
			id: "shadow",
			status: "fail",
			detail: expect.stringContaining("no `source` provider"),
		});
		const unavailable = await runDoctorCi(input({ loader: fakeLoader({}, { source: "no token" }) }).input as never);
		expect(unavailable.rows.at(-1)?.detail).toContain("not available (no token)");
		const bare = await runDoctorCi(input({ loader: fakeLoader({}) }).input as never);
		expect(bare.rows.at(-1)?.detail).toBe("the `source` provider is not available");
		const lacking = await runDoctorCi(
			input({ loader: fakeLoader({ source: { providerName: "github" } }) }).input as never
		);
		expect(lacking.rows.at(-1)?.detail).toContain("cannot list pull requests and check runs");
		const throwing = fakeSource();
		throwing.listPullRequests.mockRejectedValue(new Error("rate limited"));
		const failed = await runDoctorCi(input({ loader: fakeLoader({ source: throwing }) }).input as never);
		expect(failed.rows.at(-1)).toMatchObject({ status: "fail", detail: expect.stringContaining("rate limited") });
		expect(failed.status).toBe("fail");
	});

	it("passes the limit to the read", async () => {
		const source = fakeSource();
		await runDoctorCi(input({ loader: fakeLoader({ source }), shadowLimit: 1 }).input as never);
		expect(source.listCheckRuns).toHaveBeenCalledTimes(1);
	});
});
