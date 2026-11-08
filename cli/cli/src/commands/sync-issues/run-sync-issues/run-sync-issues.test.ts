import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import type { IssueRecord, SyncResult } from "../../../plugin/index.js";
import { fakeIssues, loadedWith, loaderFor, record } from "../../migrate/migrate.testing.js";
import { runSyncIssues } from "./run-sync-issues.js";
import type { RunSyncIssuesInput } from "./run-sync-issues.type.js";

const result = (source: string, key: string, over: Partial<SyncResult> = {}): SyncResult => ({
	source,
	key,
	created: false,
	updated: false,
	changes: [],
	dropped: [],
	...over,
});

type Fake = Parameters<typeof fakeIssues>[1];

/** A GitHub side that exports `records` and a Linear side that syncs; the sides swap for the other direction. */
function setup(records: IssueRecord[], sync: NonNullable<Fake>["sync"], reverse = false) {
	const reader = fakeIssues(reverse ? "linear" : "github", { export: vi.fn(async () => records) });
	const writer = fakeIssues(reverse ? "github" : "linear", { sync });
	const [a, b] = reverse ? ["linear", "github"] : ["github", "linear"];
	return { reader, writer, makeLoader: loaderFor({ [a!]: { issues: reader }, [b!]: { issues: writer } }) };
}

async function run(input: Partial<RunSyncIssuesInput> & { makeLoader: RunSyncIssuesInput["makeLoader"] }) {
	const lines: string[] = [];
	const report = await runSyncIssues({
		loaded: loadedWith(),
		context: { repoRoot: "/x" },
		from: "github",
		to: "linear:team=ENG",
		yes: true,
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...input,
	});
	return { report, lines, text: lines.join("\n") };
}

describe("runSyncIssues", () => {
	it("creates, updates and leaves alone, and reports the counts and what did not carry across", async () => {
		const { reader, writer, makeLoader } = setup(
			[record("#1"), record("#2"), record("#3")],
			vi.fn(async () => [
				result("#1", "ENG-1", { created: true, dropped: ["assignee (no Linear user with that email)"] }),
				result("#2", "ENG-2", { updated: true, changes: ["title", "state"] }),
				result("#3", "ENG-3"),
			])
		);
		const { report, text } = await run({ makeLoader, since: "2026-03-01T00:00:00.000Z" });
		expect(reader.export).toHaveBeenCalledWith({ all: true, since: "2026-03-01T00:00:00.000Z" });
		expect(writer.sync).toHaveBeenCalledWith(expect.any(Array), { dryRun: false });
		expect(report.counts).toEqual({ created: 1, updated: 1, unchanged: 1, guarded: 0, left: 0 });
		expect(report.notCarried).toEqual([{ what: "assignee (no Linear user with that email)", count: 1 }]);
		expect(text).toContain("#1 → ENG-1 (created)");
		expect(text).toContain("#2 → ENG-2 (updated: title, state)");
		expect(text).toContain("#3 → ENG-3 (unchanged)");
		expect(text).toContain("github to linear: created 1, updated 1, unchanged 1, skipped (guard) 0, left 0");
		expect(text).toContain("not carried across:");
		expect(text).toContain("assignee (no Linear user with that email): 1 issue(s)");
	});

	it("writes nothing to the source: it only calls export on it", async () => {
		const { reader, makeLoader } = setup(
			[record("#1")],
			vi.fn(async () => [result("#1", "ENG-1")])
		);
		await run({ makeLoader });
		expect(Object.keys(reader).filter((k) => typeof (reader as never)[k] === "function")).toEqual([
			"export",
			"import",
		]);
		expect(reader.import).not.toHaveBeenCalled();
	});

	it("skips a source issue that is itself a copy, before anything is written (GitHub to Linear)", async () => {
		const { writer, makeLoader } = setup(
			[record("#1"), record("#2", { migratedFrom: "https://linear.app/x/issue/ENG-9" })],
			vi.fn(async () => [result("#1", "ENG-1", { created: true })])
		);
		const { report, text } = await run({ makeLoader });
		expect(writer.sync).toHaveBeenCalledWith([expect.objectContaining({ key: "#1" })], { dryRun: false });
		expect(report.counts).toMatchObject({ created: 1, guarded: 1 });
		expect(text).toContain("#2 is a copy of https://linear.app/x/issue/ENG-9; not synced back");
		expect(text).toContain("skipped (guard) 1");
	});

	it("skips a copy in the other direction too (Linear to GitHub)", async () => {
		const { writer, makeLoader } = setup(
			[record("ENG-1", { migratedFrom: "https://github.com/o/r/issues/1" }), record("ENG-2")],
			vi.fn(async () => [result("ENG-2", "#2", { created: true })]),
			true
		);
		const { report, text } = await run({ makeLoader, from: "linear:team=ENG", to: "github" });
		expect(writer.sync).toHaveBeenCalledWith([expect.objectContaining({ key: "ENG-2" })], { dryRun: false });
		expect(report.counts).toMatchObject({ created: 1, guarded: 1 });
		expect(text).toContain("linear to github:");
	});

	it("never calls the target when every issue is a copy", async () => {
		const sync = vi.fn(async () => []);
		const { makeLoader } = setup([record("#1", { migratedFrom: "https://x" })], sync);
		const { report } = await run({ makeLoader, yes: false, interactive: false });
		expect(sync).not.toHaveBeenCalled();
		expect(report).toMatchObject({ status: "ok", counts: { guarded: 1, created: 0 } });
	});

	it("an idempotent second run changes nothing", async () => {
		const sync = vi.fn(async (rs: IssueRecord[]) => rs.map((r) => result(r.key, `ENG-${r.key.slice(1)}`)));
		const { makeLoader } = setup([record("#1"), record("#2")], sync);
		const { report, text } = await run({ makeLoader });
		expect(report.counts).toEqual({ created: 0, updated: 0, unchanged: 2, guarded: 0, left: 0 });
		expect(text).toContain("created 0, updated 0, unchanged 2");
	});

	it("stops cleanly on a rate limit and counts the rest as left", async () => {
		const { makeLoader } = setup(
			[record("#1"), record("#2"), record("#3")],
			vi.fn(async () => [result("#1", "ENG-1", { created: true })])
		);
		const { report, text } = await run({ makeLoader });
		expect(report.status).toBe("ok");
		expect(report.counts).toMatchObject({ created: 1, left: 2 });
		expect(text).toContain("linear is rate limiting; 2 issue(s) are left for the next run");
		expect(text).toContain("left 2");
	});

	it("on a dry run passes dryRun, says what would happen and does not ask", async () => {
		const { writer, makeLoader } = setup(
			[record("#1"), record("#2")],
			vi.fn(async () => [
				result("#1", undefined as never, { created: true, key: undefined }),
				result("#2", "ENG-2", { updated: true, changes: ["labels"] }),
			])
		);
		const confirm = vi.fn();
		const { text } = await run({ makeLoader, yes: false, context: { repoRoot: "/x", dryRun: true }, confirm });
		expect(writer.sync).toHaveBeenCalledWith(expect.any(Array), { dryRun: true });
		expect(confirm).not.toHaveBeenCalled();
		expect(text).toContain("#1 → (new) (would create)");
		expect(text).toContain("#2 → ENG-2 (would update: labels)");
		expect(text).toContain("dry run, nothing written; would create 1, would update 1");
	});

	it("asks first, and stops when the answer is no", async () => {
		const { writer, makeLoader } = setup(
			[record("#1")],
			vi.fn(async () => [])
		);
		const confirm = vi.fn(async () => false);
		const { report, text } = await run({ makeLoader, yes: false, interactive: true, confirm });
		expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Sync 1 issue(s) from github to linear?"));
		expect(report.status).toBe("cancelled");
		expect(writer.sync).not.toHaveBeenCalled();
		expect(text).toContain("cancelled; nothing was changed");
	});

	it("goes ahead on a yes, using the inquirer prompt by default", async () => {
		inquirerConfirm.mockResolvedValueOnce(true);
		const { writer, makeLoader } = setup(
			[record("#1")],
			vi.fn(async () => [result("#1", "ENG-1")])
		);
		await run({ makeLoader, yes: false, interactive: true });
		expect(inquirerConfirm).toHaveBeenCalled();
		expect(writer.sync).toHaveBeenCalled();
	});

	it("refuses without a terminal unless --yes", async () => {
		const { makeLoader } = setup(
			[record("#1")],
			vi.fn(async () => [])
		);
		await expect(run({ makeLoader, yes: false, interactive: false })).rejects.toThrow(NonInteractiveError);
	});

	it("asks the terminal by default", async () => {
		const { makeLoader } = setup(
			[record("#1")],
			vi.fn(async () => [])
		);
		const tty = process.stdin.isTTY;
		process.stdin.isTTY = false;
		try {
			await expect(run({ makeLoader, yes: false })).rejects.toThrow(NonInteractiveError);
		} finally {
			process.stdin.isTTY = tty;
		}
	});

	it("fails when the target throws, and says a second run continues", async () => {
		const { makeLoader } = setup(
			[record("#1")],
			vi.fn(async () => {
				throw new Error("boom");
			})
		);
		const { report, text } = await run({ makeLoader });
		expect(report.status).toBe("fail");
		expect(text).toContain("a second run continues where this stopped");
	});

	it("prints to the console when no printer is given", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const { makeLoader } = setup(
			[record("#1")],
			vi.fn(async () => [result("#1", "ENG-1")])
		);
		await runSyncIssues({
			loaded: loadedWith(),
			context: { repoRoot: "/x" },
			from: "github",
			to: "linear:team=ENG",
			yes: true,
			makeLoader,
		});
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});

	it("fails when --from and --to are the same", async () => {
		const { makeLoader } = setup([], vi.fn());
		const { report } = await run({ makeLoader, to: "github" });
		expect(report).toMatchObject({ status: "fail", reason: expect.stringContaining("are the same") });
	});

	it("fails when a side cannot be loaded", async () => {
		const noSource = await run({ makeLoader: loaderFor({ linear: { issues: fakeIssues("linear") } }) });
		expect(noSource.report.reason).toContain("source:");
		const noTarget = await run({ makeLoader: loaderFor({ github: { issues: fakeIssues("github") } }) });
		expect(noTarget.report.reason).toContain("target:");
	});

	it("skips when the target cannot sync", async () => {
		const reader = fakeIssues("github");
		const writer = fakeIssues("linear");
		const { report } = await run({
			makeLoader: loaderFor({ github: { issues: reader }, linear: { issues: writer } }),
		});
		expect(report).toMatchObject({ status: "skip", reason: expect.stringContaining("cannot be a sync target") });
	});

	it("skips when the source cannot export, fails when reading throws, skips when empty", async () => {
		const noExport = fakeIssues("github", { export: undefined });
		const writer = fakeIssues("linear", { sync: vi.fn() });
		const a = await run({ makeLoader: loaderFor({ github: { issues: noExport }, linear: { issues: writer } }) });
		expect(a.report.status).toBe("skip");
		const throwing = fakeIssues("github", {
			export: vi.fn(async () => {
				throw new Error("nope");
			}),
		});
		const b = await run({ makeLoader: loaderFor({ github: { issues: throwing }, linear: { issues: writer } }) });
		expect(b.report.status).toBe("fail");
		const c = await run({ makeLoader: setup([], vi.fn()).makeLoader });
		expect(c.report).toMatchObject({ status: "skip", reason: "nothing to sync" });
	});
});
