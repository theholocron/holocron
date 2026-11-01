import { describe, expect, it } from "vitest";

import { checkSpecs } from "./check-specs.js";

const md = (...lines: string[]): string => `${lines.join("\n")}\n`;

const ADR = md("---", "id: ADR-0009", "title: T", "status: proposed", "date: 2026-05-01", "---");
const SPEC = md("---", "id: SPEC-0001", "status: draft", "issue: x#1", "---");

describe("checkSpecs", () => {
	it("checks only the ADRs and specs, and counts them", () => {
		const result = checkSpecs([
			{ path: "docs/wiki/decisions/0009-task-manifest.md", text: ADR },
			{ path: "docs/wiki/decisions/template.md", text: "no frontmatter" },
			{ path: ".notes/tech-x.spec.md", text: SPEC },
			{ path: ".notes/scratch.md", text: "no frontmatter" },
			{ path: "src/index.ts", text: "" },
		]);
		expect(result).toEqual({ fileCount: 2, findings: [] });
	});

	it("routes each file to the ADR or the spec rules and collects every finding in file order", () => {
		const result = checkSpecs([
			{ path: "docs/wiki/decisions/0001-x.md", text: ADR },
			{ path: ".notes/tech-x.spec.md", text: md("---", "status: draft", "---") },
		]);
		expect(result.fileCount).toBe(2);
		expect(result.findings.map((f) => [f.file, f.rule, f.severity])).toEqual([
			["docs/wiki/decisions/0001-x.md", "id", "error"],
			[".notes/tech-x.spec.md", "id", "warning"],
			[".notes/tech-x.spec.md", "issue", "warning"],
		]);
	});

	it("fails the later of two specs that share an id, saying which has it first", () => {
		const result = checkSpecs([
			{ path: ".notes/a.spec.md", text: SPEC },
			{ path: ".notes/b.spec.md", text: SPEC },
			{ path: "docs/wiki/specifications/c.spec.md", text: SPEC.replace("0001", "0002") },
		]);

		expect(result.findings).toEqual([
			{
				file: ".notes/b.spec.md",
				line: 2,
				rule: "id",
				reason: 'id "SPEC-0001" is also the id of .notes/a.spec.md',
				severity: "error",
			},
		]);
	});

	it("does not take an ADR's id, or a spec with none, for a duplicate", () => {
		const result = checkSpecs([
			{ path: "docs/wiki/decisions/0009-a.md", text: ADR },
			{ path: "docs/wiki/decisions/0010-b.md", text: ADR.replace("ADR-0009", "ADR-0010") },
			{ path: ".notes/a.spec.md", text: md("---", "status: draft", "issue: x#1", "---") },
			{ path: ".notes/b.spec.md", text: md("---", "status: draft", "issue: x#1", "---") },
		]);

		expect(result.findings.filter((f) => f.severity === "error")).toEqual([]);
	});

	it("is empty for no files", () => {
		expect(checkSpecs([])).toEqual({ fileCount: 0, findings: [] });
	});
});
