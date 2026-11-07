import type { BoardSummary, BoardTemplate } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { issue, nodes, scopeWith } from "../test-helpers.js";
import { AUTO_ARCHIVE_RULE, AUTO_CLOSE_RULE, LinearProjects } from "./projects.js";

const PROJECT = (over: Record<string, unknown> = {}) => ({
	id: "p1",
	name: "Roadmap",
	description: "",
	url: "https://linear.app/acme/project/roadmap",
	archivedAt: null,
	status: { id: "ps", name: "Planned", type: "planned" },
	teams: { nodes: [{ id: "team1", key: "ENG" }] },
	...over,
});
const BOARD: BoardSummary = { id: "p1", name: "Roadmap", url: "u", closed: false };
const AUTOMATION = {
	team: { autoArchivePeriod: 6, autoClosePeriod: null, autoCloseState: null, triageEnabled: false },
};
const TEMPLATE: BoardTemplate = {
	name: "roadmap",
	statuses: [
		{ name: "Todo", category: "planned" },
		{ name: "Blocked", category: "blocked", description: "waiting" },
	],
	fields: [
		{ name: "Priority", type: "single_select", options: ["P0"] },
		{ name: "Size", type: "number" },
	],
	views: [{ name: "Board", layout: "board" }],
	rules: [AUTO_ARCHIVE_RULE, AUTO_CLOSE_RULE, "Nonsense"],
};

function make(routes: Parameters<typeof scopeWith>[0] = []) {
	const s = scopeWith([[/autoArchivePeriod/, AUTOMATION], ...routes]);
	return { ...s, projects: new LinearProjects(s.scope) };
}

describe("LinearProjects boards", () => {
	it("lists only the team's projects, marks archived ones closed, and finds an open one by name", async () => {
		const { projects } = make([
			[
				/projects\(first/,
				{
					projects: nodes([
						PROJECT(),
						PROJECT({ id: "p2", name: "Old", archivedAt: "2025-01-01" }),
						PROJECT({ id: "p3", name: "Other", teams: { nodes: [{ id: "elsewhere" }] } }),
					]),
				},
			],
		]);
		expect((await projects.list("acme")).map((b) => [b.name, b.closed])).toEqual([
			["Roadmap", false],
			["Old", true],
		]);
		expect((await projects.find("acme", "Roadmap"))?.id).toBe("p1");
		expect(await projects.find("acme", "Old")).toBeUndefined();
		expect(await projects.whoami()).toEqual({ ok: true, boards: 2 });
	});

	it("create makes the project for the team and adds the missing statuses", async () => {
		const { projects, called } = make([
			[/projectCreate/, { projectCreate: { project: PROJECT({ id: "pn", name: "New" }) } }],
			[/workflowStateCreate/, { workflowStateCreate: { workflowState: { id: "n", name: "Blocked" } } }],
		]);
		const board = await projects.create("acme", "New", TEMPLATE);
		expect(board.id).toBe("pn");
		expect(called(/projectCreate/)[0]!.variables.input).toEqual({ name: "New", teamIds: ["team1"] });
		const made = called(/workflowStateCreate/);
		expect(made).toHaveLength(1);
		expect(made[0]!.variables.input).toMatchObject({ name: "Blocked", type: "started", description: "waiting" });
	});

	it("close archives", async () => {
		const { projects, called } = make([[/projectArchive/, { projectArchive: { success: true } }]]);
		await projects.close("acme", BOARD);
		expect(called(/projectArchive/)[0]!.variables.id).toBe("p1");
	});

	it("read gives the team's statuses, the built-in priority and the automation rules", async () => {
		const { projects } = make();
		const state = await projects.read("acme", BOARD);
		expect(state.statuses).toContain("In Review");
		expect(state.fields).toEqual([
			{ name: "Priority", type: "single_select", options: ["Urgent", "High", "Medium", "Low"] },
		]);
		expect(state.views).toEqual([]);
		expect(state.rules).toEqual([
			{ name: AUTO_ARCHIVE_RULE, enabled: true },
			{ name: AUTO_CLOSE_RULE, enabled: false },
		]);
	});

	it("ensure reports what Linear cannot do as todos and changes nothing it should not", async () => {
		const { projects } = make([[/workflowStateCreate/, { workflowStateCreate: { workflowState: { id: "n" } } }]]);
		const report = await projects.ensure("acme", BOARD, TEMPLATE);
		expect(report.changes).toEqual(["status Blocked added to team ENG"]);
		expect(report.todos).toEqual([
			expect.stringContaining('field "Size"'),
			expect.stringContaining('view "Board"'),
			expect.stringContaining(`turn on "${AUTO_CLOSE_RULE}"`),
			expect.stringContaining('automation "Nonsense"'),
		]);
	});
});

describe("LinearProjects items", () => {
	it("maps status, category, priority and only open blockers", async () => {
		const blocker = (identifier: string, type: string, rel = "blocks") => ({
			id: "r",
			type: rel,
			issue: { id: identifier, identifier, state: { type } },
		});
		const { projects } = make([
			[
				/issues\(first/,
				{
					issues: nodes([
						issue({
							inverseRelations: {
								nodes: [
									blocker("ENG-5", "started"),
									blocker("ENG-6", "completed"),
									blocker("ENG-7", "started", "related"),
								],
							},
						}),
						issue({
							identifier: "ENG-2",
							priority: 0,
							state: { id: "s-done", name: "Done", type: "completed" },
						}),
						issue({ identifier: "ENG-3", state: { id: "x", name: "Waiting", type: "started" } }),
					]),
				},
			],
		]);
		const items = await projects.items("acme", BOARD, TEMPLATE);
		expect(items[0]).toEqual({
			key: "ENG-1",
			title: "Do the thing",
			open: true,
			status: "Todo",
			category: "planned",
			blockedBy: ["ENG-5"],
			priority: "high",
		});
		expect(items[1]).toMatchObject({ open: false, category: "done" });
		expect(items[1]?.priority).toBeUndefined();
		expect(items[2]?.category).toBe("active");
	});
});

describe("LinearProjects setStatus and move", () => {
	it("setStatus writes the state, and is a no-op when already there", async () => {
		const { projects, called } = make([
			[/issue\(id/, { issue: issue() }],
			[/issueUpdate/, { issueUpdate: { issue: issue() } }],
		]);
		expect(await projects.setStatus("acme", BOARD, "ENG-1", "in progress")).toMatchObject({ transitioned: true });
		expect(called(/issueUpdate/)[0]!.variables.input).toEqual({ stateId: "s-prog" });
		expect(await projects.setStatus("acme", BOARD, "1", "Todo")).toMatchObject({ transitioned: false });
		await expect(projects.setStatus("acme", BOARD, "1", "Nope")).rejects.toThrow(/no status "Nope"/);
	});

	it("move puts open issues on the target project and leaves closed ones", async () => {
		const { projects, called } = make([
			[
				/issues\(first/,
				{
					issues: nodes([
						issue(),
						issue({
							id: "i2",
							identifier: "ENG-2",
							state: { id: "s-done", name: "Done", type: "completed" },
						}),
					]),
				},
			],
			[/issueUpdate/, { issueUpdate: { issue: issue() } }],
		]);
		const report = await projects.move("acme", BOARD, { ...BOARD, id: "p2" }, TEMPLATE);
		expect(report).toEqual({ moved: ["ENG-1"], kept: [], left: ["ENG-2"] });
		expect(called(/issueUpdate/)).toHaveLength(1);
		expect(called(/issueUpdate/)[0]!.variables.input).toEqual({ projectId: "p2" });
	});
});

describe("LinearProjects — the less common shapes", () => {
	it("ensure adds a status with no description, handles a template with no rules, and reads null automation periods", async () => {
		const s = scopeWith([
			[
				/autoArchivePeriod/,
				{
					team: {
						autoArchivePeriod: null,
						autoClosePeriod: null,
						autoCloseState: null,
						triageEnabled: false,
					},
				},
			],
			[/workflowStateCreate/, { workflowStateCreate: { workflowState: { id: "n" } } }],
		]);
		const projects = new LinearProjects(s.scope);
		const report = await projects.ensure("acme", BOARD, {
			name: "t",
			statuses: [{ name: "Someday", category: "backlog" }],
			fields: [],
			views: [],
		});
		expect(report).toEqual({ created: false, changes: ["status Someday added to team ENG"], todos: [] });
		expect(s.called(/workflowStateCreate/)[0]!.variables.input).not.toHaveProperty("description");
		const state = await projects.read("acme", BOARD);
		expect(state.rules.every((r) => !r.enabled)).toBe(true);
	});
});
