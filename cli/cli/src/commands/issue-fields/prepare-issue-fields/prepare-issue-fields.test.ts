import { describe, expect, it } from "vitest";

import { prepareIssueFields } from "./prepare-issue-fields.js";

const AREAS = { cli: ["cli/**"] };

describe("prepareIssueFields", () => {
	it("passes through only what was given", () => {
		expect(prepareIssueFields({}, undefined)).toEqual({ ok: true, fields: {}, areaLabels: [] });
		expect(
			prepareIssueFields(
				{
					kind: "bug",
					priority: "high",
					effort: "low",
					startDate: "2026-12-01",
					targetDate: "2026-12-31",
					parent: " #3 ",
					blockedBy: ["#4", " #4 ", "", "#5"],
					project: " Roadmap ",
					areas: ["cli"],
				},
				AREAS
			)
		).toEqual({
			ok: true,
			fields: {
				kind: "bug",
				priority: "high",
				effort: "low",
				startDate: "2026-12-01",
				targetDate: "2026-12-31",
				parent: "#3",
				blockedBy: ["#4", "#5"],
			},
			areaLabels: ["area:cli"],
			project: "Roadmap",
		});
	});

	it("reports every problem at once", () => {
		const result = prepareIssueFields(
			{ startDate: "soon", targetDate: "2026-13-40", parent: " ", project: "", areas: ["x"] },
			AREAS
		);
		expect(result).toEqual({
			ok: false,
			problems: [
				'--start-date must be a date written YYYY-MM-DD, got "soon"',
				'--target-date must be a date written YYYY-MM-DD, got "2026-13-40"',
				"--parent is empty",
				"--project is empty",
				'unknown area "x"; the declared areas are cli',
			],
		});
	});

	it("refuses a target before the start and a parent that is also a blocker", () => {
		expect(
			prepareIssueFields(
				{ startDate: "2026-12-31", targetDate: "2026-12-01", parent: "#1", blockedBy: ["#1"] },
				undefined
			)
		).toEqual({
			ok: false,
			problems: [
				"--target-date 2026-12-01 is before --start-date 2026-12-31",
				"#1 cannot be both the parent and a blocker",
			],
		});
	});
});
