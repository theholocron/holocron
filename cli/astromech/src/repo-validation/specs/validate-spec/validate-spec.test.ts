import { describe, expect, it } from "vitest";

import { validateSpec } from "./validate-spec.js";

const md = (...lines: string[]): string => `${lines.join("\n")}\n`;

const file = ".notes/tech-x.spec.md";

describe("validateSpec", () => {
	it("passes a spec with an id, a known status and an issue", () => {
		expect(
			validateSpec(file, md("---", "id: SPEC-0007", "status: draft", "issue: theholocron/holocron#913", "---"))
		).toEqual([]);
	});

	it("warns on a missing id, which `specs sync` numbers, and errors on one that is not SPEC- and digits", () => {
		const bare = validateSpec(file, md("---", "status: draft", "issue: x#1", "---"));
		const bad = validateSpec(file, md("---", "id: ADR-0007", "status: draft", "issue: x#1", "---"));

		expect(bare).toEqual([
			{
				file,
				line: 1,
				rule: "id",
				reason: "missing `id` — `holocron specs sync` numbers a spec once it is on the default branch",
				severity: "warning",
			},
		]);
		expect(bad).toEqual([
			{
				file,
				line: 2,
				rule: "id",
				reason: 'invalid id "ADR-0007" — must be SPEC- and four digits, such as SPEC-0007',
				severity: "error",
			},
		]);
		expect(validateSpec(file, md("---", "id: SPEC-12345", "status: draft", "issue: x#1", "---"))).toEqual([]);
	});

	it("flags a missing frontmatter block", () => {
		expect(validateSpec(file, "# No frontmatter\n").map((f) => f.rule)).toEqual(["frontmatter"]);
	});

	it("flags a missing status", () => {
		expect(validateSpec(file, md("---", "id: SPEC-0001", "issue: x#1", "---"))).toEqual([
			{ file, line: 1, rule: "status", reason: "missing `status` field", severity: "error" },
		]);
	});

	it("flags an unknown status at its own line", () => {
		expect(validateSpec(file, md("---", "id: SPEC-0001", "status: shipped", "issue: x#1", "---"))).toEqual([
			{
				file,
				line: 3,
				rule: "status",
				reason: 'invalid status "shipped" — must be one of: draft, proposed, accepted, archived, superseded',
				severity: "error",
			},
		]);
	});

	it("warns on a missing issue, except for archived and superseded specs", () => {
		expect(validateSpec(file, md("---", "id: SPEC-0001", "status: draft", "---"))).toEqual([
			{
				file,
				line: 1,
				rule: "issue",
				reason: "missing `issue` field — every spec must have a companion GitHub issue",
				severity: "warning",
			},
		]);
		expect(validateSpec(file, md("---", "id: SPEC-0001", "status: archived", "---"))).toEqual([]);
		expect(validateSpec(file, md("---", "id: SPEC-0001", "status: superseded", "---"))).toEqual([]);
	});
});
