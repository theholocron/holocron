import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

const inquirerConfirm = vi.hoisted(() => vi.fn());
vi.mock("@inquirer/prompts", () => ({ confirm: inquirerConfirm }));

import { NonInteractiveError } from "@theholocron/kyber/ui";

import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { board, fakeProjects } from "../../project/testing/fake-projects.js";
import { runIssueUpdate } from "./run-issue-update.js";
import type { RunIssueUpdateInput } from "./run-issue-update.type.js";

type Update = (key: string, patch: unknown) => Promise<{ key: string; changed: string[]; dropped?: string[] }>;
const issuesFake = (update?: Update | null) => ({
	providerName: "github",
	...(update === null ? {} : { update: vi.fn(update ?? (async () => ({ key: "#12", changed: ["title"] }))) }),
});

async function run(
	options: Partial<RunIssueUpdateInput> & {
		issues?: ReturnType<typeof issuesFake> | null;
		projects?: ReturnType<typeof fakeProjects>;
		configured?: boolean;
	} = {}
) {
	const { issues = issuesFake(), projects, configured = true, ...rest } = options;
	const lines: string[] = [];
	const base = loadedWith(
		configured
			? {
					issues: "github",
					...(projects ? { projects: ["github", { boards: [{ template: "roadmap", name: "v5" }] }] } : {}),
				}
			: {}
	);
	const report = await runIssueUpdate({
		key: "#12",
		title: "New title",
		loaded: { ...base, resolved: { ...base.resolved, repo: { labels: { areas: { cli: ["cli/**"] } } } } as never },
		context: { repoRoot: "/r" },
		yes: true,
		loader: fakeLoader({ ...(issues ? { issues } : {}), ...(projects ? { projects } : {}) }),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n"), issues };
}

describe("runIssueUpdate", () => {
	it("passes only what was named, with the area as a label added", async () => {
		const { report, text, issues } = await run({
			title: "T",
			body: "B",
			state: "closed",
			addLabels: ["a", " a ", ""],
			removeLabels: ["b"],
			assignees: ["me"],
			milestone: " v4.0 ",
			unblock: ["#7"],
			clear: ["parent", "parent"],
			kind: "bug",
			effort: "low",
			areas: ["cli"],
		});
		expect(issues!.update).toHaveBeenCalledWith("#12", {
			kind: "bug",
			effort: "low",
			title: "T",
			body: "B",
			state: "closed",
			addLabels: ["a", "area:cli"],
			removeLabels: ["b"],
			assignees: ["me"],
			milestone: "v4.0",
			unblock: ["#7"],
			clear: ["parent"],
		});
		expect(report).toMatchObject({ status: "ok", changed: ["title"] });
		expect(text).toContain("updated: title");
	});

	it("says so when the issue was already as asked, and lists what was dropped", async () => {
		const unchanged = await run({ issues: issuesFake(async () => ({ key: "#12", changed: [] })) });
		expect(unchanged.text).toContain("already as asked; nothing changed");
		const dropped = await run({
			issues: issuesFake(async () => ({
				key: "ENG-1",
				changed: ["effort: low"],
				dropped: ["startDate (Linear has no start date)"],
			})),
			startDate: "2026-12-01",
		});
		expect(dropped.text).toContain("not carried across");
		expect(dropped.text).toContain("Linear has no start date");
	});

	it("refuses when nothing is named to change", async () => {
		const { report, text, issues } = await run({ title: undefined });
		expect(report.status).toBe("fail");
		expect(text).toContain("nothing to change");
		expect(issues!.update).not.toHaveBeenCalled();
	});

	it("refuses a field that is both set and cleared, a label added and removed, a blocker added and removed", async () => {
		const { report, text, issues } = await run({
			effort: "low",
			clear: ["effort"],
			addLabels: ["x"],
			removeLabels: ["X"],
			blockedBy: ["#4"],
			unblock: ["#4"],
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("effort is both set and cleared");
		expect(text).toContain('the label "x" is both added and removed');
		expect(text).toContain("#4 is both added and removed as a blocker");
		expect(issues!.update).not.toHaveBeenCalled();
	});

	it("fails on a blank key, title or milestone and on a bad date, before it reads any provider", async () => {
		expect((await run({ key: " " })).text).toContain("the issue key is empty");
		const blanks = await run({ title: " ", milestone: " ", targetDate: "x" });
		expect(blanks.text).toContain("--title is empty");
		expect(blanks.text).toContain("--milestone is empty");
		expect(blanks.text).toContain("--target-date must be a date");
	});

	it("fails for no `issues` provider, an unavailable one, and one with no update", async () => {
		expect((await run({ configured: false })).text).toContain("no `issues` provider");
		const none = await run({ issues: null });
		expect(none.text).toContain("not available");
		const noUpdate = await run({ issues: issuesFake(null) });
		expect(noUpdate.report.status).toBe("fail");
		expect(noUpdate.text).toContain("does not support `update issue`");
		const reason = await run({ loader: fakeLoader({}, { issues: "no token" }) });
		expect(reason.text).toContain("not available (no token)");
	});

	it("previews on --dry-run and writes nothing", async () => {
		const { report, text, issues } = await run({
			context: { repoRoot: "/r", dryRun: true },
			effort: "high",
			clear: ["assignees"],
		});
		expect(issues!.update).not.toHaveBeenCalled();
		expect(report.status).toBe("ok");
		expect(text).toContain("would update the issue (title; effort: high; clear: assignees)");
		expect(text).toContain("dry-run");
	});

	it("asks first, and changes nothing when the answer is no", async () => {
		const confirm = vi.fn(async () => false);
		const { report, text, issues } = await run({ yes: false, interactive: true, confirm });
		expect(confirm).toHaveBeenCalledWith("Update #12 (title)?");
		expect(report.status).toBe("cancelled");
		expect(issues!.update).not.toHaveBeenCalled();
		expect(text).toContain("nothing was changed");
		expect((await run({ yes: false, interactive: true, confirm: async () => true })).report.status).toBe("ok");
	});

	it("refuses to ask without a terminal, and asks with the inquirer prompt by default", async () => {
		const err = await run({ yes: false, interactive: false }).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NonInteractiveError);
		expect((err as Error).message).toMatch(/--yes/);
		inquirerConfirm.mockResolvedValueOnce(true);
		expect((await run({ yes: false, interactive: true })).report.status).toBe("ok");
		expect(inquirerConfirm).toHaveBeenCalledWith({ message: "Update #12 (title)?", default: false });
	});

	it("turns a provider error into a failing row", async () => {
		const { report, text } = await run({
			issues: issuesFake(async () => {
				throw new Error("403 Forbidden");
			}),
		});
		expect(report.status).toBe("fail");
		expect(text).toContain("could not update the issue");
		expect(text).toContain("403 Forbidden");
	});

	it("adds to the board without a priority when none was named, and reads whether stdin is a terminal", async () => {
		const addItems = vi.fn(async () => [{ key: "#12", added: false, dropped: [] }]);
		const projects = fakeProjects({ find: vi.fn(async () => board("v5")), addItems });
		await run({ projects, project: "v5" });
		expect(addItems).toHaveBeenCalledWith("acme", expect.anything(), [{ key: "#12" }], expect.anything());
		const tty = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
		Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
		try {
			const err = await run({ yes: false }).catch((e: unknown) => e);
			expect(err).toBeInstanceOf(NonInteractiveError);
		} finally {
			if (tty) Object.defineProperty(process.stdin, "isTTY", tty);
			else delete (process.stdin as { isTTY?: boolean }).isTTY;
		}
	});

	it("puts the issue on the board after the update, and previews it on a dry run", async () => {
		const addItems = vi.fn(async () => [{ key: "#12", added: true, dropped: [] }]);
		const projects = fakeProjects({ find: vi.fn(async () => board("v5")), addItems });
		const done = await run({ projects, project: "v5", priority: "low" });
		expect(done.text).toContain('added "v5"');
		expect(addItems).toHaveBeenCalledWith(
			"acme",
			expect.anything(),
			[{ key: "#12", priority: "low" }],
			expect.anything()
		);
		addItems.mockClear();
		const preview = await run({ projects, project: "v5", context: { repoRoot: "/r", dryRun: true } });
		expect(preview.text).toContain('would add #12 to "v5"');
		expect(addItems).not.toHaveBeenCalled();
	});
});
