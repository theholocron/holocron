import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import type { SourceCheckRun, SourceCheckRunWrite } from "../../../plugin/index.js";
import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { runReconcileCi } from "./run-reconcile-ci.js";
import type { RunReconcileCiInput } from "./run-reconcile-ci.type.js";

const NOW = Date.parse("2026-11-22T10:30:00Z");
const at = (minute: number) => new Date(Date.parse("2026-11-22T10:00:00Z") + minute * 60_000).toISOString();
const leaf = (name: string, conclusion: string | null, id: number): SourceCheckRun => ({
	id,
	name,
	status: conclusion === null ? "in_progress" : "completed",
	conclusion,
	startedAt: at(1),
	url: `https://x/${id}`,
});
const pr = (number: number, headSha = `sha${number}`) => ({
	number,
	title: "feat: x",
	state: "open" as const,
	merged: false,
	branch: `feat/${number}-x`,
	headSha,
	url: `https://x/pull/${number}`,
});

/** A `source` that keeps check runs per commit, so a post can be read back. */
function sourceFake(byCommit: Record<string, SourceCheckRun[]>, over: Record<string, unknown> = {}) {
	let next = 500;
	return {
		providerName: "github",
		listPullRequests: vi.fn(async () => Object.keys(byCommit).map((sha, i) => pr(i + 1, sha))),
		getPullRequest: vi.fn(async (n: number) => pr(n, `sha${n}`)),
		listCheckRuns: vi.fn(async (sha: string) => byCommit[sha] ?? []),
		listCommitStatuses: vi.fn(async () => []),
		createCheckRun: vi.fn(async (sha: string, name: string, write: SourceCheckRunWrite) => {
			const id = next++;
			(byCommit[sha] ??= []).push({
				id,
				name,
				status: write.status,
				conclusion: write.conclusion ?? null,
				startedAt: write.startedAt ?? null,
				url: null,
			});
			return id;
		}),
		updateCheckRun: vi.fn(async (id: number, write: SourceCheckRunWrite) => {
			for (const runs of Object.values(byCommit)) {
				const found = runs.find((run) => run.id === id);
				if (found) {
					found.status = write.status;
					found.conclusion = write.conclusion ?? null;
				}
			}
		}),
		...over,
	};
}

function loadedWithTasks() {
	const loaded = loadedWith({ source: "github" });
	return {
		...loaded,
		resolved: { ...loaded.resolved, extraRequiredChecks: ["typecheck / Conclusion", "codecov/patch"] },
	};
}

async function run(source: unknown, over: Partial<RunReconcileCiInput> = {}) {
	const lines: string[] = [];
	const report = await runReconcileCi({
		loaded: loadedWithTasks(),
		context: { repoRoot: "/tmp/repo" },
		loader: fakeLoader({ source }),
		print: (line) => lines.push(stripVTControlCharacters(line)),
		now: () => NOW,
		...over,
	});
	return { report, text: lines.join("\n") };
}

const green = (id: number): SourceCheckRun[] => [
	leaf("typecheck / Conclusion", "success", id),
	leaf("codecov/patch", "success", id + 1),
];

describe("runReconcileCi", () => {
	it("posts the verdict on a pull request that has none and fails the run, because a delivery was missed", async () => {
		const source = sourceFake({ sha1: green(1) });
		const { report, text } = await run(source);
		expect(report.status).toBe("fail");
		expect(text).toContain("repaired: the check was missing or wrong (now success); a delivery was missed");
		expect(source.createCheckRun).toHaveBeenCalledWith(
			"sha1",
			"ci / Required checks",
			expect.objectContaining({ status: "completed", conclusion: "success" })
		);
	});

	it("leaves a pull request alone whose check already says the verdict, and writes nothing", async () => {
		const runs = [...green(1), { ...leaf("ci / Required checks", "success", 9), startedAt: at(2) }];
		const source = sourceFake({ sha1: runs });
		const { report, text } = await run(source);
		expect(report.status).toBe("ok");
		expect(text).toContain("up to date (success)");
		expect(source.createCheckRun).not.toHaveBeenCalled();
		expect(source.updateCheckRun).not.toHaveBeenCalled();
	});

	it("only reports a check still within the grace as in flight", async () => {
		const runs = [
			...green(1),
			{
				id: 9,
				name: "ci / Required checks",
				status: "in_progress",
				conclusion: null,
				startedAt: at(25),
				url: null,
			},
		];
		const source = sourceFake({ sha1: runs });
		const { report, text } = await run(source);
		expect(report.status).toBe("ok");
		expect(text).toContain("posted success (still in flight)");
	});

	it("reads --max-age as the grace", async () => {
		const runs = [
			...green(1),
			{
				id: 9,
				name: "ci / Required checks",
				status: "in_progress",
				conclusion: null,
				startedAt: at(25),
				url: null,
			},
		];
		const { report } = await run(sourceFake({ sha1: runs }), { maxAgeMinutes: 1 });
		expect(report.status).toBe("fail");
	});

	it("on --dry-run says what it would do and posts nothing", async () => {
		const source = sourceFake({ sha1: green(1) });
		const { report, text } = await run(source, { context: { repoRoot: "/tmp/repo", dryRun: true } });
		expect(report.status).toBe("fail");
		expect(text).toContain("(dry-run)");
		expect(text).toContain("would repair");
		expect(source.createCheckRun).not.toHaveBeenCalled();
		const young = sourceFake({
			sha1: [
				...green(1),
				{
					id: 9,
					name: "ci / Required checks",
					status: "in_progress",
					conclusion: null,
					startedAt: at(25),
					url: null,
				},
			],
		});
		const again = await run(young, { context: { repoRoot: "/tmp/repo", dryRun: true } });
		expect(again.text).toContain("would post success (still in flight)");
	});

	it("reconciles the one pull request it is given", async () => {
		const source = sourceFake({ sha4: green(1) });
		const { report } = await run(source, { pullRequest: 4 });
		expect(source.getPullRequest).toHaveBeenCalledWith(4);
		expect(source.listPullRequests).not.toHaveBeenCalled();
		expect(report.rows.map((r) => r.id)).toEqual(["#4"]);
	});

	it("skips a pull request the provider gave no head commit for, and a repo with no open pull requests", async () => {
		const noSha = sourceFake(
			{},
			{ listPullRequests: vi.fn(async () => [(({ headSha: _omitted, ...rest }) => rest)(pr(3))]) }
		);
		expect((await run(noSha)).text).toContain("the provider gave no head commit");
		const none = sourceFake({}, { listPullRequests: vi.fn(async () => []) });
		const out = await run(none);
		expect(out.report.status).toBe("ok");
		expect(out.text).toContain("no open pull requests");
	});

	it("turns a failure on one pull request into its failing row and goes on with the rest", async () => {
		const source = sourceFake({ sha1: green(1), sha2: green(3) });
		source.listCheckRuns.mockImplementationOnce(async () => {
			throw new Error("rate limited");
		});
		const { report, text } = await run(source);
		expect(report.rows).toHaveLength(2);
		expect(text).toContain("rate limited");
	});

	it("fails with a row for every setup problem", async () => {
		expect((await run(sourceFake({}), { maxAgeMinutes: 0 })).text).toContain(
			"--max-age is a number of minutes above zero"
		);
		const noSource = await runReconcileCi({
			loaded: loadedWith({}),
			context: { repoRoot: "/tmp/repo" },
			print: () => {},
		});
		expect(noSource.rows[0]?.detail).toContain("no `source` provider");
		const unavailable = await runReconcileCi({
			loaded: loadedWithTasks(),
			context: { repoRoot: "/tmp/repo" },
			loader: fakeLoader({}, { source: "no token" }),
			print: () => {},
		});
		expect(unavailable.rows[0]?.detail).toContain("not available (no token)");
		const bare = await runReconcileCi({
			loaded: loadedWithTasks(),
			context: { repoRoot: "/tmp/repo" },
			loader: fakeLoader({}),
			print: () => {},
		});
		expect(bare.rows[0]?.detail).toBe("the `source` provider is not available");
		const lacking = await run({ providerName: "github" });
		expect(lacking.text).toContain("cannot listCheckRuns, listCommitStatuses, createCheckRun, updateCheckRun");
	});

	it("fails when pull requests cannot be read", async () => {
		const throwing = sourceFake(
			{},
			{
				listPullRequests: vi.fn(async () => {
					throw new Error("boom");
				}),
			}
		);
		expect((await run(throwing)).text).toContain("boom");
		const noList = sourceFake({}, { listPullRequests: undefined });
		expect((await run(noList)).text).toContain("cannot list pull requests");
		const noGet = sourceFake({}, { getPullRequest: undefined });
		expect((await run(noGet, { pullRequest: 2 })).text).toContain("cannot read a pull request");
	});
});
