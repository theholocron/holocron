import { describe, expect, it } from "vitest";

import { issue, nodes, scopeWith } from "../test-helpers.js";
import { LinearIssues } from "./issues.js";

const USER = { id: "u1", name: "Luke", displayName: "luke", email: "luke@x.io" };
const VIEWER = { viewer: USER, organization: { id: "o", name: "Acme", urlKey: "acme" } };

function make(routes: Parameters<typeof scopeWith>[0] = []) {
	const s = scopeWith(routes);
	return { ...s, issues: new LinearIssues(s.scope) };
}

const updates = (calls: ReturnType<typeof make>["called"]) =>
	calls(/issueUpdate/).map((c) => c.variables.input as Record<string, unknown>);

describe("LinearIssues.create with fields", () => {
	it("sets priority, the due date and the parent in the call, the kind as its label, and relates the blockers after", async () => {
		const { issues, called } = make([
			[
				/issue\(id/,
				(v: Record<string, unknown>) => ({ issue: issue({ id: `id-${v.id}`, identifier: String(v.id) }) }),
			],
			[/issueLabels\(first/, { issueLabels: nodes([{ id: "l9", name: "chore", color: "#0f0", team: null }]) }],
			[/issueCreate/, { issueCreate: { issue: issue({ id: "new", identifier: "ENG-9" }) } }],
			[/issueUpdate/, { issueUpdate: { issue: issue() } }],
			[/issueRelationCreate/, { issueRelationCreate: { success: true } }],
		]);
		const out = await issues.create({
			summary: "t",
			kind: "task",
			priority: "urgent",
			targetDate: "2026-12-31",
			startDate: "2026-12-01",
			effort: "high",
			parent: "7",
			blockedBy: ["ENG-3"],
		});
		expect(out).toEqual({ key: "ENG-9", dropped: ["startDate (Linear has no start date): 2026-12-01"] });
		expect(called(/issueCreate/)[0]!.variables.input).toMatchObject({
			labelIds: ["l9"],
			parentId: "id-ENG-7",
			priority: 1,
			dueDate: "2026-12-31",
		});
		expect(updates(called)).toEqual([{ estimate: 5 }]);
		expect(called(/issueRelationCreate/)[0]!.variables.input).toEqual({
			issueId: "id-ENG-3",
			relatedIssueId: "new",
			type: "blocks",
		});
	});

	it("keeps the issue when the parent, a blocker or the estimate is refused", async () => {
		const { issues } = make([
			[/issue\(id/, { issue: null }],
			[/issueCreate/, { issueCreate: { issue: issue({ id: "new", identifier: "ENG-9" }) } }],
		]);
		const out = await issues.create({ summary: "t", parent: "ENG-7", blockedBy: ["ENG-3"] });
		expect(out.key).toBe("ENG-9");
		expect(out.dropped).toHaveLength(2);
		expect(out.dropped![0]).toContain("parent ENG-7");
		expect(out.dropped![1]).toContain("blocked by ENG-3");
	});

	it("drops an effort the team refuses", async () => {
		const { issues } = make([
			[/issueCreate/, { issueCreate: { issue: issue({ id: "new", identifier: "ENG-9" }) } }],
		]);
		const out = await issues.create({ summary: "t", effort: "low" });
		expect(out.dropped?.[0]).toContain("effort low");
	});
});

describe("LinearIssues.update", () => {
	const current = (over: Record<string, unknown> = {}) =>
		issue({
			priority: 2,
			estimate: 3,
			dueDate: "2026-06-01",
			assignee: USER,
			project: { id: "p1", name: "Roadmap" },
			parent: { id: "par", identifier: "ENG-2" },
			labels: { nodes: [{ id: "l1", name: "bug" }] },
			...over,
		});

	it("changes only what differs", async () => {
		const { issues, called } = make([
			[/issue\(id/, { issue: current() }],
			[/issueUpdate/, { issueUpdate: { issue: current() } }],
		]);
		const out = await issues.update("ENG-1", {
			title: "New",
			body: "new text",
			priority: "urgent",
			targetDate: "2026-12-31",
			effort: "high",
		});
		expect(out.key).toBe("ENG-1");
		expect(out.changed).toEqual(["title", "body", "priority: urgent", "targetDate: 2026-12-31", "effort: high"]);
		expect(updates(called)).toEqual([
			{ title: "New", description: "new text", priority: 1, dueDate: "2026-12-31" },
			{ estimate: 5 },
		]);
	});

	it("writes nothing when the issue is as asked", async () => {
		const { issues, called } = make([[/issue\(id/, { issue: current() }]]);
		const out = await issues.update("ENG-1", {
			title: "Do the thing",
			body: "body",
			priority: "high",
			targetDate: "2026-06-01",
			effort: "medium",
			addLabels: ["BUG"],
		});
		expect(out.changed).toEqual([]);
		expect(called(/issueUpdate/)).toHaveLength(0);
	});

	it("clears what is named and nothing else", async () => {
		const { issues, called } = make([
			[/issue\(id/, { issue: current() }],
			[/issueUpdate/, { issueUpdate: { issue: current() } }],
		]);
		const out = await issues.update("ENG-1", {
			clear: ["assignees", "milestone", "parent", "priority", "targetDate", "effort", "startDate"],
		});
		expect(out.changed).toEqual([
			"priority cleared",
			"targetDate cleared",
			"assignees cleared",
			"milestone cleared",
			"parent cleared",
			"effort cleared",
		]);
		expect(out.dropped).toEqual(["startDate cleared (Linear has no start date)"]);
		expect(updates(called)).toEqual([
			{ priority: 0, dueDate: null, assigneeId: null, projectId: null, parentId: null },
			{ estimate: null },
		]);
	});

	it("sets the assignee, the milestone, the parent, labels and the state", async () => {
		const { issues, called } = make([
			[/viewer/, VIEWER],
			[
				/issue\(id/,
				(v: Record<string, unknown>) => ({
					issue: v.id === "ENG-1" ? current() : issue({ id: "par9", identifier: "ENG-9" }),
				}),
			],
			[/projects\(first/, { projects: nodes([{ id: "p2", name: "Next", teams: { nodes: [{ id: "team1" }] } }]) }],
			[
				/issueLabels\(first/,
				{
					issueLabels: nodes([
						{ id: "l2", name: "area:cli", color: "#000", team: null },
						{ id: "l3", name: "enhancement", color: "#000", team: null },
					]),
				},
			],
			[/issueUpdate/, { issueUpdate: { issue: current() } }],
		]);
		const out = await issues.update("1", {
			assignees: ["me", "other"],
			milestone: "Next",
			parent: "ENG-9",
			addLabels: ["area:cli"],
			removeLabels: ["bug"],
			kind: "feature",
			state: "closed",
		});
		expect(out.changed).toEqual([
			"milestone: Next",
			"parent: ENG-9",
			"labels added: area:cli, enhancement",
			"label removed: bug",
			"state: closed",
		]);
		expect(out.dropped).toEqual(["assignee (Linear holds one): other"]);
		expect(updates(called)[0]).toMatchObject({ projectId: "p2", parentId: "par9", stateId: "s-done" });
		expect(updates(called)[0]!.labelIds).toEqual(expect.arrayContaining(["l2", "l3"]));
	});

	it("drops an unknown assignee, a start date and a kind it cannot clear twice", async () => {
		const { issues } = make([
			[/users\(first/, { users: nodes([USER]) }],
			[/issue\(id/, { issue: current({ assignee: null }) }],
		]);
		const out = await issues.update("ENG-1", { assignees: ["nobody"], startDate: "2026-12-01" });
		expect(out.dropped).toEqual([
			"startDate (Linear has no start date): 2026-12-01",
			"assignee (no Linear user matches): nobody",
		]);
	});

	it("adds a blocker that is missing, skips one that is there, and removes one on unblock", async () => {
		const inverse = [
			{ id: "r1", type: "blocks", issue: { id: "b2", identifier: "ENG-2", state: { type: "started" } } },
			{ id: "r2", type: "blocks", issue: { id: "b3", identifier: "ENG-3", state: { type: "started" } } },
		];
		const { issues, called } = make([
			[
				/issue\(id/,
				(v: Record<string, unknown>) => ({
					issue:
						v.id === "ENG-1"
							? current({ inverseRelations: { nodes: inverse } })
							: issue({ id: `id-${v.id}`, identifier: String(v.id) }),
				}),
			],
			[/issueRelationCreate/, { issueRelationCreate: { success: true } }],
			[/issueRelationDelete/, { issueRelationDelete: { success: true } }],
		]);
		const out = await issues.update("ENG-1", { blockedBy: ["ENG-5", "ENG-2"], unblock: ["3", "ENG-8"] });
		expect(out.changed).toEqual(["blocked by: ENG-5", "unblocked: 3"]);
		expect(called(/issueRelationCreate/)[0]!.variables.input).toMatchObject({
			issueId: "id-ENG-5",
			relatedIssueId: "i1",
		});
		expect(called(/issueRelationDelete/)[0]!.variables.id).toBe("r2");
	});

	it("reopens an issue to the team's first open state", async () => {
		const { issues, called } = make([
			[/issue\(id/, { issue: current({ state: { id: "s-done", name: "Done", type: "completed" } }) }],
			[/issueUpdate/, { issueUpdate: { issue: current() } }],
		]);
		const out = await issues.update("ENG-1", { state: "open" });
		expect(out.changed).toEqual(["state: open"]);
		expect(updates(called)).toEqual([{ stateId: "s-todo" }]);
	});
});
