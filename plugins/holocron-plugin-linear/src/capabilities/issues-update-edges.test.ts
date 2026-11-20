import { describe, expect, it } from "vitest";

import { issue, nodes, scopeWith } from "../test-helpers.js";
import { LinearIssues } from "./issues.js";

const USER = { id: "u1", name: "Luke", displayName: "luke", email: "luke@x.io" };

function make(routes: Parameters<typeof scopeWith>[0] = []) {
	const s = scopeWith(routes);
	return { ...s, issues: new LinearIssues(s.scope) };
}

const updates = (calls: ReturnType<typeof make>["called"]) =>
	calls(/issueUpdate/).map((c) => c.variables.input as Record<string, unknown>);

const current = (over: Record<string, unknown> = {}) =>
	issue({
		assignee: USER,
		project: { id: "p1", name: "Roadmap" },
		parent: { id: "par", identifier: "ENG-2" },
		labels: {
			nodes: [
				{ id: "l1", name: "bug" },
				{ id: "l2", name: "chore" },
			],
		},
		...over,
	});

describe("LinearIssues.update, as asked already", () => {
	it("leaves a title-only change at one field, and skips an assignee, project, parent and state already set", async () => {
		const { issues, called } = make([
			[/users\(first/, { users: nodes([USER]) }],
			[
				/projects\(first/,
				{ projects: nodes([{ id: "p1", name: "Roadmap", teams: { nodes: [{ id: "team1" }] } }]) },
			],
			[
				/issue\(id/,
				(v: Record<string, unknown>) => ({
					issue: v.id === "ENG-2" ? issue({ id: "par", identifier: "ENG-2" }) : current(),
				}),
			],
			[/issueUpdate/, { issueUpdate: { issue: current() } }],
		]);
		const out = await issues.update("ENG-1", {
			title: "Other",
			assignees: ["luke@x.io"],
			milestone: "Roadmap",
			parent: "ENG-2",
			state: "open",
		});
		expect(out.changed).toEqual(["title"]);
		expect(updates(called)).toEqual([{ title: "Other" }]);
	});

	it("treats a missing description as empty, and assigns an issue that has nobody", async () => {
		const { issues, called } = make([
			[/users\(first/, { users: nodes([USER]) }],
			[/issue\(id/, { issue: current({ description: null, assignee: null }) }],
			[/issueUpdate/, { issueUpdate: { issue: current() } }],
		]);
		expect((await issues.update("ENG-1", { body: "" })).changed).toEqual([]);
		const out = await issues.update("ENG-1", { body: "new", assignees: ["luke"] });
		expect(out.changed).toEqual(["body", "assignees: luke"]);
		expect(updates(called)).toEqual([{ description: "new", assigneeId: "u1" }]);
	});

	it("drops a state the team has no state for", async () => {
		const { issues, called } = make([
			[/workflowStates\(first/, { workflowStates: nodes([]) }],
			[/issue\(id/, { issue: current() }],
		]);
		const out = await issues.update("ENG-1", { state: "closed" });
		expect(out.dropped).toEqual(["state closed (the team has no matching state)"]);
		expect(called(/issueUpdate/)).toHaveLength(0);
	});
});

describe("LinearIssues.update, labels", () => {
	it("clearing the kind removes the kind labels the issue has, and adds none", async () => {
		const { issues, called } = make([
			[/issue\(id/, { issue: current() }],
			[/issueUpdate/, { issueUpdate: { issue: current() } }],
		]);
		const out = await issues.update("ENG-1", { clear: ["kind"] });
		expect(out.changed).toEqual(["label removed: bug", "label removed: chore"]);
		expect(updates(called)).toEqual([{ labelIds: [] }]);
	});

	it("removing a label the issue has keeps the others, and one it lacks is left", async () => {
		const { issues, called } = make([
			[/issue\(id/, { issue: current() }],
			[/issueUpdate/, { issueUpdate: { issue: current() } }],
		]);
		const out = await issues.update("ENG-1", { removeLabels: ["BUG", "nothing"] });
		expect(out.changed).toEqual(["label removed: bug"]);
		expect(updates(called)).toEqual([{ labelIds: ["l2"] }]);
	});
});

describe("a failure that is not an Error", () => {
	// A client that rejects with a bare string, as a transport layer sometimes does.
	const scope = {
		teamKey: "ENG",
		team: async () => ({ id: "team1", key: "ENG", name: "Engineering" }),
		client: {
			issues: {
				get: async () => {
					throw "plain text failure";
				},
				create: async () => issue({ id: "new", identifier: "ENG-9" }),
				update: async () => issue(),
				relate: async () => undefined,
			},
		},
	} as unknown as ConstructorParameters<typeof LinearIssues>[0];

	it("is named as text when the parent cannot be read on create", async () => {
		const out = await new LinearIssues(scope).create({ summary: "t", parent: "ENG-7" });
		expect(out.dropped).toEqual(["parent ENG-7 (plain text failure)"]);
	});

	it("is named as text when a blocker cannot be read on create", async () => {
		const out = await new LinearIssues(scope).create({ summary: "t", blockedBy: ["ENG-3"] });
		expect(out.dropped).toEqual(["blocked by ENG-3 (plain text failure)"]);
	});
});

describe("LinearIssues.update, refused writes", () => {
	it("drops an estimate the team refuses and reports the rest as changed", async () => {
		let n = 0;
		const { issues } = make([
			[/issue\(id/, { issue: current() }],
			[
				/issueUpdate/,
				() => {
					if (++n === 2) throw new Error("estimates are off");
					return { issueUpdate: { issue: current() } };
				},
			],
		]);
		const out = await issues.update("ENG-1", { title: "T", effort: "high" });
		expect(out.changed).toEqual(["title"]);
		expect(out.dropped?.[0]).toContain("effort: high");
	});

	it("drops a blocker it cannot find, and an unblock of one that was never a blocker", async () => {
		const { issues } = make([
			[/issue\(id/, (v: Record<string, unknown>) => ({ issue: v.id === "ENG-1" ? current() : null })],
		]);
		const out = await issues.update("ENG-1", { blockedBy: ["ENG-9"], unblock: ["ENG-8"] });
		expect(out.changed).toEqual([]);
		expect(out.dropped).toHaveLength(1);
		expect(out.dropped![0]).toContain("blocked by ENG-9");
	});
});
