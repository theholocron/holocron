import { describe, expect, it } from "vitest";

import { TASKS } from "../../registry/index.js";
import { describeTasks } from "./describe-tasks.js";

describe("describeTasks", () => {
	const text = describeTasks();

	it("groups the tasks under the six intent groups, in order", () => {
		const headings = text.split("\n").filter((line) => /^[A-Z][A-Za-z ]+:$/.test(line));
		expect(headings).toEqual([
			"Verification:",
			"Source Quality:",
			"Security:",
			"Delivery:",
			"Platform:",
			"Knowledge:",
		]);
	});

	it("lists each suite with its leaves, and the tasks outside a suite apart", () => {
		expect(text).toContain("test (suite)  test:unit, test:visual, test:perf");
		expect(text).toContain("scan (suite)  scan:secrets, scan:code");
		expect(text).toContain("  typecheck");
		expect(text).toContain("  check-tokens");
	});

	it("mentions every task of the registry", () => {
		expect(Object.keys(TASKS).filter((id) => !text.includes(id))).toEqual([]);
	});

	it("explains how to run a suite and one of its leaves", () => {
		expect(text).toContain("`holocron run <suite>` runs every leaf the repo lists");
	});
});
