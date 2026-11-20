import { stripVTControlCharacters } from "node:util";

import { describe, expect, it, vi } from "vitest";

import { fakeLoader, loadedWith } from "../../migrate/migrate.testing.js";
import { board, fakeProjects } from "../../project/testing/fake-projects.js";
import { runIssueCreate } from "./run-issue-create.js";
import type { RunIssueCreateInput } from "./run-issue-create.type.js";

const AREAS = { cli: ["cli/**"], sentinel: ["apps/sentinel/**"] };

async function run(
	options: Partial<RunIssueCreateInput> & {
		issues?: { create: ReturnType<typeof vi.fn> };
		projects?: ReturnType<typeof fakeProjects>;
		declared?: Record<string, string[]>;
	} = {}
) {
	const { issues = { create: vi.fn(async () => ({ key: "#9" })) }, projects, declared = AREAS, ...rest } = options;
	const lines: string[] = [];
	const base = loadedWith({
		issues: "github",
		...(projects ? { projects: ["github", { boards: [{ template: "roadmap", name: "v5" }] }] } : {}),
	});
	const report = await runIssueCreate({
		title: "Fix the thing",
		loaded: { ...base, resolved: { ...base.resolved, repo: { labels: { areas: declared } } } as never },
		context: { repoRoot: "/r" },
		yes: true,
		loader: fakeLoader({ issues, ...(projects ? { projects } : {}) }),
		print: (l) => lines.push(stripVTControlCharacters(l)),
		...rest,
	});
	return { report, text: lines.join("\n"), issues };
}

describe("runIssueCreate with issue fields", () => {
	it("passes every field to the provider, and the area as a label beside the others", async () => {
		const { issues, report } = await run({
			labels: ["bug"],
			kind: "bug",
			priority: "high",
			effort: "medium",
			startDate: "2026-12-01",
			targetDate: "2026-12-31",
			parent: "#3",
			blockedBy: ["#4", "#5"],
			areas: ["cli", "area:sentinel"],
		});
		expect(issues.create).toHaveBeenCalledWith({
			summary: "Fix the thing",
			labels: ["bug", "area:cli", "area:sentinel"],
			kind: "bug",
			priority: "high",
			effort: "medium",
			startDate: "2026-12-01",
			targetDate: "2026-12-31",
			parent: "#3",
			blockedBy: ["#4", "#5"],
		});
		expect(report).toMatchObject({ status: "ok", key: "#9" });
	});

	it("shows the fields in the question and in a dry run, and files nothing on a dry run", async () => {
		const confirm = vi.fn(async () => false);
		await run({ yes: false, interactive: true, confirm, kind: "task", effort: "low", parent: "#2" });
		expect(confirm).toHaveBeenCalledWith('File "Fix the thing" (type: task; effort: low; parent: #2)?');
		const { issues, text } = await run({
			context: { repoRoot: "/r", dryRun: true },
			priority: "urgent",
			project: "v5",
		});
		expect(issues.create).not.toHaveBeenCalled();
		expect(text).toContain("would file the issue (priority: urgent; board: v5)");
	});

	it("fails before it files for a bad date, an unknown area and a repo with no areas", async () => {
		const bad = await run({ startDate: "tomorrow", areas: ["nope"] });
		expect(bad.report.status).toBe("fail");
		expect(bad.text).toContain("--start-date must be a date written YYYY-MM-DD");
		expect(bad.text).toContain('unknown area "nope"');
		expect(bad.issues.create).not.toHaveBeenCalled();
		expect((await run({ declared: {}, areas: ["cli"] })).text).toContain("declares none");
	});

	it("lists what the tracker could not hold, as for any other field", async () => {
		const { text } = await run({
			issues: {
				create: vi.fn(async () => ({
					key: "ENG-1",
					dropped: ["startDate (Linear has no start date): 2026-12-01"],
				})),
			},
			startDate: "2026-12-01",
		});
		expect(text).toContain("not carried across");
		expect(text).toContain("Linear has no start date");
	});

	it("puts the new issue on the declared board, with its priority", async () => {
		const addItems = vi.fn(async () => [{ key: "#9", added: true, dropped: [] }]);
		const projects = fakeProjects({ find: vi.fn(async () => board("v5")), addItems });
		const { report, text } = await run({ projects, project: "v5", priority: "high" });
		expect(report.status).toBe("ok");
		expect(text).toContain('added "v5"');
		expect(addItems).toHaveBeenCalledWith(
			"acme",
			expect.anything(),
			[{ key: "#9", priority: "high" }],
			expect.anything()
		);
	});

	it("keeps the key and fails the run when the board is missing", async () => {
		const projects = fakeProjects({ find: vi.fn(async () => undefined), addItems: vi.fn() });
		const { report, text } = await run({ projects, project: "v5" });
		expect(report).toMatchObject({ status: "fail", key: "#9" });
		expect(text).toContain("filed #9");
		expect(text).toContain("does not exist yet");
	});
});
