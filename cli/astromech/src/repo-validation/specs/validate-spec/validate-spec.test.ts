import { describe, expect, it } from "vitest";

import { validateSpec } from "./validate-spec.js";

const md = (...lines: string[]): string => `${lines.join("\n")}\n`;

const file = ".notes/tech-x.spec.md";

describe("validateSpec", () => {
	it("passes a spec with a known status and an issue", () => {
		expect(validateSpec(file, md("---", "status: draft", "issue: theholocron/holocron#913", "---"))).toEqual([]);
	});

	it("flags a missing frontmatter block", () => {
		expect(validateSpec(file, "# No frontmatter\n").map((f) => f.rule)).toEqual(["frontmatter"]);
	});

	it("flags a missing status", () => {
		expect(validateSpec(file, md("---", "issue: x#1", "---"))).toEqual([
			{ file, line: 1, rule: "status", reason: "missing `status` field", severity: "error" },
		]);
	});

	it("flags an unknown status at its own line", () => {
		expect(validateSpec(file, md("---", "status: shipped", "issue: x#1", "---"))).toEqual([
			{
				file,
				line: 2,
				rule: "status",
				reason: 'invalid status "shipped" — must be one of: draft, proposed, accepted, archived, superseded',
				severity: "error",
			},
		]);
	});

	it("warns on a missing issue, except for archived and superseded specs", () => {
		expect(validateSpec(file, md("---", "status: draft", "---"))).toEqual([
			{
				file,
				line: 1,
				rule: "issue",
				reason: "missing `issue` field — every spec must have a companion GitHub issue",
				severity: "warning",
			},
		]);
		expect(validateSpec(file, md("---", "status: archived", "---"))).toEqual([]);
		expect(validateSpec(file, md("---", "status: superseded", "---"))).toEqual([]);
	});
});
