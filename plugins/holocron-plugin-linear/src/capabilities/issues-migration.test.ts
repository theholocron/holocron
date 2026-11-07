import type { IssueRecord } from "@theholocron/cli";
import { describe, expect, it } from "vitest";

import { issue, nodes, scopeWith } from "../test-helpers.js";
import { LinearIssues } from "./issues.js";

const PROJECT = {
	id: "p1",
	name: "Roadmap",
	archivedAt: null,
	teams: { nodes: [{ id: "team1" }] },
};

function make(routes: Parameters<typeof scopeWith>[0] = []) {
	const s = scopeWith(routes);
	return { ...s, issues: new LinearIssues(s.scope) };
}

const record = (over: Partial<IssueRecord> = {}): IssueRecord => ({
	key: "#7",
	url: "https://github.com/o/r/issues/7",
	title: "From GitHub",
	body: "text",
	statusCategory: "in-progress",
	closed: false,
	priority: "high",
	labels: ["bug", "new-label"],
	assignee: { id: "luke", displayName: "Luke", emailAddress: "LUKE@x.io" },
	blockedBy: [],
	comments: [
		{ author: "leia", body: "hi", createdAt: "2026-01-05T00:00:00Z" },
		{ body: "anon", createdAt: "2026-01-06T00:00:00Z" },
	],
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-02T00:00:00Z",
	...over,
});

const importRoutes: Parameters<typeof scopeWith>[0] = [
	[/attachmentsForURL/, { attachmentsForURL: nodes([]) }],
	[/issueLabels\(first/, { issueLabels: nodes([{ id: "l1", name: "Bug", color: "#f00", team: null }]) }],
	[/issueLabelCreate/, { issueLabelCreate: { issueLabel: { id: "l2", name: "new-label" } } }],
	[/users\(first/, { users: nodes([{ id: "u1", name: "Luke", displayName: "luke", email: "luke@x.io" }]) }],
	[/projects\(first/, { projects: nodes([PROJECT]) }],
	[/projectCreate/, { projectCreate: { project: { ...PROJECT, id: "pn" } } }],
	[
		/issueCreate/,
		(v: Record<string, unknown>) => ({
			issueCreate: { issue: issue({ id: `new-${(v.input as { title: string }).title}`, identifier: "ENG-50" }) },
		}),
	],
	[/attachmentLinkURL/, { attachmentLinkURL: { success: true } }],
	[/commentCreate/, { commentCreate: { comment: { id: "c" } } }],
	[/issueRelationCreate/, { issueRelationCreate: { success: true } }],
	[/issueUpdate/, { issueUpdate: { issue: issue() } }],
];

describe("LinearIssues.export", () => {
	it("reads an issue with priority, labels, project, parent, blockers and comments", async () => {
		const { issues } = make([
			[
				/issue\(id: \$id\) \{ id identifier/,
				{
					issue: issue({
						priority: 1,
						assignee: { id: "u1", name: "Luke", displayName: "luke", email: "luke@x.io" },
						labels: { nodes: [{ id: "l", name: "bug" }] },
						project: { id: "p1", name: "Roadmap" },
						parent: { id: "i0", identifier: "ENG-0" },
						state: { id: "s-done", name: "Done", type: "completed" },
						inverseRelations: {
							nodes: [
								{
									id: "r1",
									type: "blocks",
									issue: { id: "i5", identifier: "ENG-5", state: { type: "started" } },
								},
								{
									id: "r2",
									type: "related",
									issue: { id: "i6", identifier: "ENG-6", state: { type: "started" } },
								},
							],
						},
					}),
				},
			],
			[
				/comments\(first/,
				{
					issue: {
						comments: nodes([
							{
								id: "c",
								body: "hi",
								createdAt: "2026-01-03T00:00:00Z",
								user: { id: "u", name: "Leia", displayName: "leia" },
							},
							{ id: "c2", body: "bot", createdAt: "2026-01-04T00:00:00Z", user: null },
						]),
					},
				},
			],
		]);
		const [r] = await issues.export({ keys: ["ENG-1"] });
		expect(r).toMatchObject({
			key: "ENG-1",
			priority: "urgent",
			labels: ["bug"],
			milestone: "Roadmap",
			parent: "ENG-0",
			blockedBy: ["ENG-5"],
			closed: true,
			statusCategory: "done",
			status: "Done",
			assignee: { id: "u1", displayName: "luke", emailAddress: "luke@x.io" },
		});
		expect(r?.comments).toEqual([
			{ author: "leia", body: "hi", createdAt: "2026-01-03T00:00:00Z" },
			{ body: "bot", createdAt: "2026-01-04T00:00:00Z" },
		]);
	});

	it("exports a project, and open-only drops closed issues", async () => {
		const { issues, called } = make([
			[/projects\(first/, { projects: nodes([PROJECT]) }],
			[
				/issues\(first/,
				{
					issues: nodes([
						issue({ description: null }),
						issue({
							id: "i2",
							identifier: "ENG-2",
							state: { id: "s-cancel", name: "Canceled", type: "canceled" },
						}),
					]),
				},
			],
			[/comments\(first/, { issue: { comments: nodes([]) } }],
		]);
		const out = await issues.export({ milestone: "roadmap", openOnly: true });
		expect(out.map((r) => r.key)).toEqual(["ENG-1"]);
		expect(out[0]?.body).toBeUndefined();
		expect((called(/issues\(first/)[0]!.variables.filter as { project: unknown }).project).toBeDefined();
	});

	it("exports every issue of the team with `all`", async () => {
		const { issues, called } = make([
			[/issues\(first/, { issues: nodes([issue({ priority: 0 })]) }],
			[/comments\(first/, { issue: { comments: nodes([]) } }],
		]);
		const [r] = await issues.export({ all: true });
		expect(r?.priority).toBeUndefined();
		expect((called(/issues\(first/)[0]!.variables.filter as { team: unknown }).team).toBeDefined();
	});

	it("fails on an unknown project and an empty selector", async () => {
		await expect(
			make([[/projects\(first/, { projects: nodes([]) }]]).issues.export({ milestone: "x" })
		).rejects.toThrow(/Project "x" not found/);
		await expect(make().issues.export({})).rejects.toThrow(/needs keys/);
	});
});

describe("LinearIssues.import", () => {
	it("makes the issue with priority, state, labels, assignee, project, backdating, attachment and comments", async () => {
		const { issues, called } = make(importRoutes);
		const [res] = await issues.import([record({ milestone: "Roadmap" })]);
		expect(res).toEqual({
			source: "#7",
			key: "ENG-50",
			created: true,
			dropped: ["comment authors (named in the text)"],
		});
		const input = called(/issueCreate/)[0]!.variables.input as Record<string, unknown>;
		expect(input).toMatchObject({
			teamId: "team1",
			title: "From GitHub",
			description: "text",
			priority: 2,
			stateId: "s-prog",
			assigneeId: "u1",
			labelIds: ["l1", "l2"],
			projectId: "p1",
			createdAt: "2026-01-01T00:00:00Z",
		});
		expect(called(/attachmentLinkURL/)[0]!.variables).toMatchObject({
			url: "https://github.com/o/r/issues/7",
			title: "Migrated from #7",
		});
		const comments = called(/commentCreate/).map((c) => c.variables.input as Record<string, unknown>);
		expect(comments[0]).toMatchObject({ body: "**leia** wrote:\n\nhi", createdAt: "2026-01-05T00:00:00Z" });
		expect(comments[1]).toMatchObject({ body: "anon" });
	});

	it("drops an assignee with no matching user, and makes a project named by the options", async () => {
		const { issues, called } = make(importRoutes);
		const [res] = await issues.import(
			[record({ assignee: { id: "x", displayName: "X" }, comments: [], closed: true, statusCategory: "done" })],
			{ milestone: "Brand New" }
		);
		expect(res?.dropped).toEqual(["assignee (no Linear user with that email)"]);
		expect(called(/projectCreate/)[0]!.variables.input).toEqual({ name: "Brand New", teamIds: ["team1"] });
		const input = called(/issueCreate/)[0]!.variables.input as Record<string, unknown>;
		expect(input.projectId).toBe("pn");
		expect(input.stateId).toBe("s-done");
		expect(input.assigneeId).toBeUndefined();
	});

	it("skips what an earlier run attached to a team issue", async () => {
		const { issues, called } = make([
			[
				/attachmentsForURL/,
				{
					attachmentsForURL: nodes([
						{ id: "a0", url: "u", title: "t", issue: { id: "o", identifier: "OPS-1" } },
						{ id: "a", url: "u", title: "t", issue: { id: "i9", identifier: "ENG-9" } },
					]),
				},
			],
			...importRoutes,
		]);
		const [res] = await issues.import([record()]);
		expect(res).toEqual({ source: "#7", key: "ENG-9", created: false, dropped: [] });
		expect(called(/issueCreate/)).toHaveLength(0);
	});

	it("changes nothing on a dry run", async () => {
		const { issues, called } = make(importRoutes);
		const [res] = await issues.import([record({ assignee: undefined, comments: [] })], {
			dryRun: true,
			milestone: "New",
		});
		expect(res).toEqual({ source: "#7", created: true, dropped: [] });
		expect(called(/issueCreate|projectCreate|issueUpdate|issueRelationCreate/)).toHaveLength(0);
	});

	it("links parents and blockers among the migrated records, and names what it cannot link", async () => {
		const { issues, called } = make(importRoutes);
		const results = await issues.import([
			record({ key: "#1", url: "https://x/1", title: "parent", labels: [], comments: [], assignee: undefined }),
			record({
				key: "#2",
				url: "https://x/2",
				title: "child",
				labels: [],
				comments: [],
				assignee: undefined,
				parent: "#1",
				blockedBy: ["#1", "#99"],
			}),
			record({
				key: "#3",
				url: "https://x/3",
				title: "orphan",
				labels: [],
				comments: [],
				assignee: undefined,
				parent: "#98",
			}),
		]);
		expect(called(/issueUpdate/)).toHaveLength(1);
		expect(called(/issueUpdate/)[0]!.variables).toEqual({ id: "new-child", input: { parentId: "new-parent" } });
		expect(called(/issueRelationCreate/)[0]!.variables.input).toEqual({
			issueId: "new-parent",
			relatedIssueId: "new-child",
			type: "blocks",
		});
		expect(results[1]?.dropped).toEqual(["blockedBy #99 (not in this migration)"]);
		expect(results[2]?.dropped).toEqual(["parent #98 (not in this migration)"]);
	});

	it("does not relink an issue an earlier run made", async () => {
		const { issues, called } = make([
			[
				/attachmentsForURL/,
				{
					attachmentsForURL: nodes([
						{ id: "a", url: "u", title: "t", issue: { id: "i9", identifier: "ENG-9" } },
					]),
				},
			],
			...importRoutes,
		]);
		await issues.import([record({ parent: "#1", blockedBy: ["#2"] })]);
		expect(called(/issueUpdate|issueRelationCreate/)).toHaveLength(0);
	});
});
