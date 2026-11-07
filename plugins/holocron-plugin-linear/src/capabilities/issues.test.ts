import { describe, expect, it } from "vitest";

import { issue, nodes, scopeWith } from "../test-helpers.js";
import { LinearIssues } from "./issues.js";

const USER = { id: "u1", name: "Luke", displayName: "luke", email: "luke@x.io" };
const VIEWER = { viewer: USER, organization: { id: "o", name: "Acme", urlKey: "acme" } };

function make(routes: Parameters<typeof scopeWith>[0] = [], opts = {}) {
	const s = scopeWith(routes);
	return { ...s, issues: new LinearIssues(s.scope, opts) };
}

describe("LinearIssues", () => {
	it("getMyself reads the viewer", async () => {
		const { issues } = make([[/viewer/, VIEWER]]);
		expect(await issues.getMyself()).toEqual({ id: "u1", displayName: "luke", emailAddress: "luke@x.io" });
	});

	it("search filters by team, open-only and the current user", async () => {
		const { issues, called } = make([
			[/viewer/, VIEWER],
			[/issues\(first/, { issues: nodes([issue({ assignee: USER, description: null })]) }],
		]);
		const found = await issues.search({ assignee: "currentUser", openOnly: true, limit: 5 });
		expect(found[0]).toMatchObject({
			key: "ENG-1",
			status: "Todo",
			statusCategory: "open",
			assignee: { id: "u1" },
		});
		const vars = called(/issues\(first/)[0]!.variables as { filter: Record<string, unknown> };
		expect(Object.keys(vars.filter).sort()).toEqual(["assignee", "state", "team"]);
	});

	it("search takes a given assignee id and none", async () => {
		const { issues, called } = make([[/issues\(first/, { issues: nodes([]) }]]);
		await issues.search({ assignee: "u9" });
		expect((called(/issues\(first/)[0]!.variables.filter as Record<string, unknown>).assignee).toBeDefined();
	});

	it("get accepts a bare number", async () => {
		const { issues, called } = make([[/issue\(id/, { issue: issue() }]]);
		expect((await issues.get("#1")).key).toBe("ENG-1");
		expect(called(/issue\(id/)[0]!.variables.id).toBe("ENG-1");
	});

	it("create makes missing labels and resolves the milestone as a project", async () => {
		const { issues, called } = make([
			[/issueLabels\(first/, { issueLabels: nodes([{ id: "l1", name: "Bug", color: "#f00", team: null }]) }],
			[/issueLabelCreate/, { issueLabelCreate: { issueLabel: { id: "l2", name: "new" } } }],
			[
				/projects\(first/,
				{ projects: nodes([{ id: "p1", name: "Roadmap", teams: { nodes: [{ id: "team1" }] } }]) },
			],
			[/issueCreate/, { issueCreate: { issue: issue({ identifier: "ENG-9" }) } }],
		]);
		const out = await issues.create({ summary: "t", body: "b", labels: ["bug", "new"], milestone: "roadmap" });
		expect(out).toEqual({ key: "ENG-9" });
		const input = called(/issueCreate/)[0]!.variables.input as Record<string, unknown>;
		expect(input).toMatchObject({
			teamId: "team1",
			title: "t",
			description: "b",
			labelIds: ["l1", "l2"],
			projectId: "p1",
		});
	});

	it("create fails clearly on an unknown project", async () => {
		const { issues } = make([[/projects\(first/, { projects: nodes([]) }]]);
		await expect(issues.create({ summary: "t", milestone: "nope" })).rejects.toThrow(/Project "nope" not found/);
	});

	it("create with only a title sends no optional fields", async () => {
		const { issues, called } = make([[/issueCreate/, { issueCreate: { issue: issue() } }]]);
		await issues.create({ summary: "t" });
		expect(Object.keys(called(/issueCreate/)[0]!.variables.input as object).sort()).toEqual(["teamId", "title"]);
	});

	it("transition moves to the slot's state and is idempotent", async () => {
		const { issues, called } = make([
			[/issue\(id/, { issue: issue() }],
			[/issueUpdate/, { issueUpdate: { issue: issue() } }],
		]);
		expect(await issues.transition("ENG-1", "inProgress")).toMatchObject({
			transitioned: true,
			status: "In Progress",
		});
		expect(called(/issueUpdate/)[0]!.variables.input).toEqual({ stateId: "s-prog" });
		expect(await issues.transition("ENG-1", "inReview")).toMatchObject({ status: "In Review" });
		expect(await issues.transition("ENG-1", "done")).toMatchObject({ status: "Done" });
	});

	it("transition reports already there, and honours the configured state names", async () => {
		const { issues } = make(
			[[/issue\(id/, { issue: issue({ state: { id: "s-review", name: "In Review", type: "started" } }) }]],
			{ states: { inReview: "In Review" } }
		);
		expect(await issues.transition("ENG-1", "inReview")).toEqual({
			transitioned: false,
			status: "In Review",
			via: "already there",
		});
	});

	it("transition says what to configure when a slot has no state", async () => {
		const { issues } = make([
			[/workflowStates\(first/, { workflowStates: nodes([]) }],
			[/issue\(id/, { issue: issue() }],
		]);
		await expect(issues.transition("ENG-1", "done")).rejects.toThrow(/states\.done/);
	});

	it("comment posts on the resolved issue", async () => {
		const { issues, called } = make([
			[/issue\(id/, { issue: issue() }],
			[/commentCreate/, { commentCreate: { comment: { id: "c" } } }],
		]);
		await issues.comment("ENG-1", "hello");
		expect(called(/commentCreate/)[0]!.variables.input).toEqual({ issueId: "i1", body: "hello" });
	});

	it("doctor reports the team, the states and which slots resolve", async () => {
		const { issues } = make([[/viewer/, VIEWER]]);
		const report = await issues.doctor();
		expect(report.authedAs).toBe("luke (luke@x.io)");
		expect(report.projectLabel).toBe("Team: ENG (Engineering)");
		expect(report.statuses).toContainEqual({ name: "In Review", category: "in-review" });
		expect(report.lifecycle.every((l) => l.resolved)).toBe(true);
	});

	it("doctor flags a slot with no state", async () => {
		const { issues } = make([
			[/viewer/, { ...VIEWER, viewer: { ...USER, email: undefined } }],
			[/workflowStates\(first/, { workflowStates: nodes([]) }],
		]);
		const report = await issues.doctor();
		expect(report.authedAs).toBe("luke (u1)");
		expect(report.lifecycle.every((l) => !l.resolved)).toBe(true);
	});

	it("fails clearly when the team is not visible", async () => {
		const { issues } = make([[/teams\(first/, { teams: nodes([]) }]]);
		await expect(issues.search({})).rejects.toThrow(/team "ENG" not found/);
	});
});
