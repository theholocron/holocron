import { describe, expect, it } from "vitest";

import { KNOWN_TASKS } from "../known-tasks/index.js";
import { suiteMembers, SUITES } from "./suites.js";

describe("suiteMembers", () => {
	it("lists a suite's leaves in registry order", () => {
		expect(suiteMembers("test")).toEqual(["test:unit", "test:visual", "test:perf"]);
		expect(suiteMembers("lint")).toHaveLength(6);
	});

	it("is empty for a name that is not a suite", () => {
		expect(suiteMembers("typecheck")).toEqual([]);
		expect(suiteMembers("validate")).toEqual([]);
	});

	it("every suite has at least two leaves", () => {
		expect(SUITES.filter((suite) => suiteMembers(suite).length < 2)).toEqual([]);
	});
});

describe("KNOWN_TASKS", () => {
	it("holds flat ids, workflow-only ids and the old names", () => {
		const names = ["test:unit", "format", "label", "verification.unitTests", "stale"];
		expect(names.filter((name) => !KNOWN_TASKS.has(name))).toEqual([]);
	});

	it("holds neither a suite nor an unknown name", () => {
		expect(KNOWN_TASKS.has("test")).toBe(false);
		expect(KNOWN_TASKS.has("audit")).toBe(false);
	});
});
