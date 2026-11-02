import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import ciWorkflow from "../workflows/ci.yml";

const hasJq = spawnSync("jq", ["--version"]).status === 0;

/** The workflow's polling script, dedented: the real script, not a copy of it. */
function script(): string {
	const m = /run: \|\n([\s\S]*?)\n {8}env:/.exec(ciWorkflow);
	if (!m) throw new Error("could not find the run block in ci.yml");
	return m[1]!
		.split("\n")
		.map((l) => l.replace(/^ {10}/, ""))
		.join("\n");
}

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Run {
	name: string;
	status: string;
	conclusion: string | null;
	url?: string;
}

interface Posted {
	context: string;
	state: string;
	url?: string;
}

interface Poll {
	runs: Run[];
	statuses?: Posted[];
}

/**
 * Run the script with a fake `gh`. Each entry of `polls` is what one poll sees (the last one repeats), so a check that
 * is still running on the first poll and done on the second is two entries.
 */
function run(
	polls: Poll[],
	env: Record<string, string> = {}
): { code: number | null; out: string; summary: string; polled: number } {
	const dir = mkdtempSync(join(tmpdir(), "ci-aggregate-"));
	dirs.push(dir);
	polls.forEach((poll, i) => {
		const lines = poll.runs.map((r) => JSON.stringify({ url: `https://gh.test/${r.name}`, ...r }));
		writeFileSync(join(dir, `runs.${i}`), lines.join("\n"));
		writeFileSync(join(dir, `status.${i}`), JSON.stringify(poll.statuses ?? []));
	});
	writeFileSync(join(dir, "count"), "0");
	const last = polls.length - 1;
	// The fake answers `check-runs` with the current poll's runs, `status` with its statuses, and moves to the next
	// poll after the status call (the second request of a poll).
	writeFileSync(
		join(dir, "gh"),
		[
			"#!/bin/bash",
			`n=$(cat "${dir}/count"); [ "$n" -gt ${last} ] && n=${last}`,
			'case "$*" in',
			`  *check-runs*) cat "${dir}/runs.$n" ;;`,
			`  *) cat "${dir}/status.$n"; echo $(( $(cat "${dir}/count") + 1 )) > "${dir}/count" ;;`,
			"esac",
			"",
		].join("\n")
	);
	chmodSync(join(dir, "gh"), 0o755);
	const summaryFile = join(dir, "summary.md");
	const r = spawnSync("bash", ["-c", script()], {
		env: {
			PATH: `${dir}:${process.env["PATH"]}`,
			REPO: "o/r",
			SHA: "abc",
			EXPECTED: '["Typecheck","Test"]',
			STATUSES: "[]",
			TIMEOUT_MINUTES: "5",
			INTERVAL: "0",
			GITHUB_STEP_SUMMARY: summaryFile,
			...env,
		},
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});
	const summary = existsSync(summaryFile) ? readFileSync(summaryFile, "utf8") : "";
	return {
		code: r.status,
		out: `${r.stdout}${r.stderr}`,
		summary,
		polled: Number(readFileSync(join(dir, "count"), "utf8")),
	};
}

const done = (name: string, conclusion: string): Run => ({ name, status: "completed", conclusion });

describe("ci workflow", () => {
	it("is a reusable workflow whose inputs are the expected ids and the statuses", () => {
		expect(ciWorkflow).toMatch(/workflow_call:\n\s+inputs:\n\s+expected:/);
		expect(ciWorkflow).toMatch(/statuses:[\s\S]*?default: "\[\]"/);
	});

	it("reads only: checks, statuses and contents", () => {
		expect(ciWorkflow).toMatch(/permissions:\n {2}checks: read\n {2}statuses: read\n {2}contents: read/);
		expect(ciWorkflow).not.toMatch(/: write/);
	});
});

describe.skipIf(!hasJq)("ci workflow script", () => {
	it("passes when every expected id has completed green, matching by `<id> / ` prefix", () => {
		const r = run([
			{ runs: [done("Typecheck / Run tsc --noEmit", "success"), done("Test / Conclusion", "success")] },
		]);
		expect(r.code).toBe(0);
		expect(r.out).toContain("ci passed: all 2 expected checks are green.");
		expect(r.summary).toContain("| `Typecheck` | pass: success |");
		expect(r.summary).not.toContain("Re-running one failed check");
	});

	it("treats skipped and neutral as passing", () => {
		const r = run([{ runs: [done("Typecheck / a", "skipped"), done("Test / a", "neutral")] }]);
		expect(r.code).toBe(0);
	});

	it("does not match an id that is only a prefix of another name", () => {
		const r = run([{ runs: [done("Typecheck / a", "success"), done("Tests / a", "success")] }], {
			TIMEOUT_MINUTES: "0",
		});
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error title=Test::never posted");
	});

	it("fails on a failed check, lists it first with its link and annotates it", () => {
		const r = run([{ runs: [done("Typecheck / a", "success"), done("Test / a", "failure")] }]);
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error title=Test::failure https://gh.test/Test / a");
		expect(r.out).toContain("ci failed: Test");
		const rows = r.summary.split("\n").filter((l) => l.startsWith("| `"));
		expect(rows[0]).toContain("| `Test` | FAIL: failure | [open](https://gh.test/Test / a) |");
		expect(rows[1]).toContain("| `Typecheck` | pass: success |");
		expect(r.summary).toContain("Re-running one failed check does not update this one");
	});

	it("fails an id with a failing run among several (a matrix) and reports the bad conclusion", () => {
		const r = run([
			{
				runs: [
					done("Typecheck / a", "success"),
					done("Typecheck / b", "cancelled"),
					done("Test / a", "success"),
				],
			},
		]);
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error title=Typecheck::cancelled");
	});

	it("falls back to `none` when a completed run has no conclusion", () => {
		const r = run([
			{ runs: [{ name: "Typecheck / a", status: "completed", conclusion: null }, done("Test / a", "success")] },
		]);
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error title=Typecheck::none");
	});

	it("waits for a running check, then passes", () => {
		const r = run([
			{ runs: [{ name: "Typecheck / a", status: "in_progress", conclusion: null }, done("Test / a", "success")] },
			{ runs: [done("Typecheck / a", "success"), done("Test / a", "success")] },
		]);
		expect(r.code).toBe(0);
		expect(r.polled).toBe(2);
	});

	it("waits for a check that has not posted yet, then passes", () => {
		const r = run([
			{ runs: [done("Typecheck / a", "success")] },
			{ runs: [done("Typecheck / a", "success"), done("Test / a", "success")] },
		]);
		expect(r.code).toBe(0);
		expect(r.polled).toBe(2);
	});

	it("fails an id that never posted once the timeout passes", () => {
		const r = run([{ runs: [done("Typecheck / a", "success")] }], { TIMEOUT_MINUTES: "0" });
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error title=Test::never posted");
		expect(r.summary).toContain("| `Test` | FAIL: never posted | none |");
	});

	it("fails a check that is still running at the timeout", () => {
		const r = run(
			[{ runs: [{ name: "Typecheck / a", status: "queued", conclusion: null }, done("Test / a", "success")] }],
			{ TIMEOUT_MINUTES: "0" }
		);
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error title=Typecheck::timed out while still running https://gh.test/Typecheck / a");
	});

	it("never waits for itself", () => {
		// Its own run is in progress while it polls; an expected `ci` would match it, so `ci` is never waited on.
		const own: Run = { name: "ci / Required checks", status: "in_progress", conclusion: null };
		const r = run([{ runs: [done("Typecheck / a", "success"), own] }], { EXPECTED: '["Typecheck","ci"]' });
		expect(r.code).toBe(0);
		expect(r.out).toContain("all 1 expected checks");
	});

	it("escapes colons and commas in an annotation title", () => {
		const r = run([{ runs: [done("test:unit / a", "failure")] }], { EXPECTED: '["test:unit"]' });
		expect(r.out).toContain("::error title=test%3Aunit::failure");
	});

	it("waits on the codecov statuses and passes when they succeed", () => {
		const r = run(
			[
				{
					runs: [done("Typecheck / a", "success"), done("Test / a", "success")],
					statuses: [{ context: "codecov/patch", state: "pending" }],
				},
				{
					runs: [done("Typecheck / a", "success"), done("Test / a", "success")],
					statuses: [{ context: "codecov/patch", state: "success", url: "https://codecov.test" }],
				},
			],
			{ STATUSES: '["codecov/patch"]' }
		);
		expect(r.code).toBe(0);
		expect(r.polled).toBe(2);
		expect(r.summary).toContain("| `codecov/patch` | pass: success | [open](https://codecov.test) |");
	});

	it("fails a status that failed, and one that never posted", () => {
		const runs = [done("Typecheck / a", "success"), done("Test / a", "success")];
		const failed = run(
			[{ runs, statuses: [{ context: "codecov/patch", state: "failure", url: "https://codecov.test" }] }],
			{
				STATUSES: '["codecov/patch"]',
			}
		);
		expect(failed.code).toBe(1);
		expect(failed.out).toContain("::error title=codecov/patch::failure https://codecov.test");
		const missing = run([{ runs }], { STATUSES: '["codecov/patch"]', TIMEOUT_MINUTES: "0" });
		expect(missing.code).toBe(1);
		expect(missing.out).toContain("::error title=codecov/patch::never posted");
	});

	it("fails a status that is still pending at the timeout", () => {
		const r = run(
			[
				{
					runs: [done("Typecheck / a", "success"), done("Test / a", "success")],
					statuses: [{ context: "codecov/patch", state: "pending" }],
				},
			],
			{ STATUSES: '["codecov/patch"]', TIMEOUT_MINUTES: "0" }
		);
		expect(r.code).toBe(1);
		expect(r.out).toContain("::error title=codecov/patch::timed out while still running");
	});

	it("writes the summary to stdout when there is no summary file", () => {
		const r = run([{ runs: [done("Typecheck / a", "success"), done("Test / a", "success")] }], {
			GITHUB_STEP_SUMMARY: "",
		});
		expect(r.out).toContain("| Check | Result | Link |");
	});
});
