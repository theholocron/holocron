import { describe, expect, it } from "vitest";

import { planIssueTypes } from "./plan-issue-types.js";

const have = [
	{ id: 1, name: "Bug", description: "A fault", color: "red", enabled: true },
	{ id: 2, name: "task", color: "yellow", enabled: false },
];

describe("planIssueTypes", () => {
	it("creates the missing, in declaration order, and counts the total", () => {
		const plan = planIssueTypes([{ name: "Epic" }, { name: "Spike" }, { name: "bug" }], have, false);
		expect(plan.actions.map((a) => [a.kind, a.declared.name])).toEqual([
			["create", "Epic"],
			["create", "Spike"],
			["exists", "bug"],
		]);
		expect(plan.total).toBe(4);
	});

	it("leaves an existing Type alone without update, whatever differs", () => {
		const plan = planIssueTypes(
			[{ name: "Bug", description: "other", color: "blue", enabled: false }],
			have,
			false
		);
		expect(plan.actions[0]?.kind).toBe("exists");
	});

	it("updates only the description and colour that differ and are stated", () => {
		const plan = planIssueTypes(
			[
				{ name: "Bug", description: "A fault", color: "orange", enabled: false },
				{ name: "Task", description: "Work", color: "yellow" },
				{ name: "Spike" },
			],
			have,
			true
		);
		expect(plan.actions[0]).toMatchObject({
			kind: "update",
			changes: [{ field: "color", was: "red", to: "orange" }],
		});
		expect(plan.actions[1]).toMatchObject({
			kind: "update",
			changes: [{ field: "description", was: "", to: "Work" }],
		});
		expect(plan.actions[2]?.kind).toBe("create");
	});

	it("treats a missing colour as different from a stated one", () => {
		const plan = planIssueTypes([{ name: "Bug", color: "blue" }], [{ id: 1, name: "Bug", enabled: true }], true);
		expect(plan.actions[0]).toMatchObject({ changes: [{ field: "color", was: "", to: "blue" }] });
	});

	it("keeps a declaration that states nothing as exists", () => {
		expect(planIssueTypes([{ name: "Bug" }], have, true).actions[0]?.kind).toBe("exists");
	});
});
