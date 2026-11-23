import { describe, expect, it } from "vitest";

import { CORE_KINDS, issueKinds, kindProblem } from "./issue-kinds.js";

describe("issueKinds", () => {
	it("is the core three with no declaration", () => {
		expect(issueKinds(undefined)).toEqual(["bug", "feature", "task"]);
		expect(issueKinds([])).toEqual([...CORE_KINDS]);
	});

	it("adds each declared name in lower case, once, after the core", () => {
		expect(issueKinds([{ name: "Epic" }, { name: "Bug" }, { name: "Spike" }, { name: "EPIC" }])).toEqual([
			"bug",
			"feature",
			"task",
			"epic",
			"spike",
		]);
	});
});

describe("kindProblem", () => {
	it("accepts nothing given, a core kind and a declared one, ignoring case", () => {
		expect(kindProblem(undefined, undefined)).toBeUndefined();
		expect(kindProblem("task", undefined)).toBeUndefined();
		expect(kindProblem("Epic", [{ name: "Epic" }])).toBeUndefined();
	});

	it("names the valid words on a miss", () => {
		expect(kindProblem("epic", undefined)).toBe(
			'--type "epic" is not a kind this organization knows. Use one of: bug, feature, task'
		);
		expect(kindProblem("saga", [{ name: "Epic" }])).toMatch(/Use one of: bug, feature, task, epic$/);
	});
});
