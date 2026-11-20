import { describe, expect, it } from "vitest";

import { describeIssueFields } from "./describe-issue-fields.js";

describe("describeIssueFields", () => {
	it("says nothing for no fields", () => {
		expect(describeIssueFields({})).toEqual([]);
	});

	it("names each field that is set, in a fixed order", () => {
		expect(
			describeIssueFields(
				{
					blockedBy: ["#2", "#3"],
					parent: "#1",
					targetDate: "2026-12-31",
					startDate: "2026-12-01",
					effort: "low",
					priority: "high",
					kind: "bug",
				},
				"Roadmap"
			)
		).toEqual([
			"type: bug",
			"priority: high",
			"effort: low",
			"start: 2026-12-01",
			"target: 2026-12-31",
			"parent: #1",
			"blocked by: #2, #3",
			"board: Roadmap",
		]);
	});
});
