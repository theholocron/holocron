import { describe, expect, it } from "vitest";

import { checkSpecs } from "./check-specs.js";

const md = (...lines: string[]): string => `${lines.join("\n")}\n`;

const ADR = md("---", "id: ADR-0009", "title: T", "status: proposed", "date: 2026-05-01", "---");
const SPEC = md("---", "status: draft", "issue: x#1", "---");

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
			[".notes/tech-x.spec.md", "issue", "warning"],
		]);
	});

	it("is empty for no files", () => {
		expect(checkSpecs([])).toEqual({ fileCount: 0, findings: [] });
	});
});
