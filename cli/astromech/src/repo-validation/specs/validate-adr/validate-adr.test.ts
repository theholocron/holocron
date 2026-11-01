import { describe, expect, it } from "vitest";

import { validateAdr } from "./validate-adr.js";

const md = (...lines: string[]): string => `${lines.join("\n")}\n`;

const GOOD_ADR = md(
	"---",
	"id: ADR-0009",
	"title: Task manifest",
	"status: accepted",
	"date: 2026-05-01",
	"discussion: https://github.com/theholocron/holocron/discussions/1",
	"---",
	"",
	"# Body"
);

const file = "docs/wiki/decisions/0009-task-manifest.md";

describe("validateAdr", () => {
	it("passes a well-formed accepted ADR", () => {
		expect(validateAdr(file, GOOD_ADR)).toEqual([]);
	});

	it("flags a missing frontmatter block", () => {
		expect(validateAdr(file, "# No frontmatter\n")).toEqual([
			{ file, line: 1, rule: "frontmatter", reason: "no frontmatter found", severity: "error" },
		]);
	});

	it("flags an id that doesn't match the filename's sequence, at the id's own line", () => {
		expect(validateAdr(file, GOOD_ADR.replace("id: ADR-0009", "id: ADR-0010"))).toEqual([
			{
				file,
				line: 2,
				rule: "id",
				reason: 'id "ADR-0010" does not match filename sequence (expected ADR-0009)',
				severity: "error",
			},
		]);
	});

	it("flags every missing required field at line 1 (an empty title at its own line)", () => {
		const findings = validateAdr(file, md("---", "title: ''", "---"));
		expect(findings.map((f) => [f.rule, f.line, f.reason])).toEqual([
			["id", 1, "missing `id` field"],
			["title", 2, "missing or empty `title` field"],
			["status", 1, "missing `status` field"],
			["date", 1, "missing `date` field"],
		]);
	});

	it('treats a title of "" as empty too', () => {
		const findings = validateAdr(file, GOOD_ADR.replace("title: Task manifest", 'title: ""'));
		expect(findings.map((f) => f.rule)).toEqual(["title"]);
	});

	it("flags an unknown status and a non-ISO date", () => {
		const findings = validateAdr(
			file,
			GOOD_ADR.replace("status: accepted", "status: done").replace("date: 2026-05-01", "date: May 1")
		);
		expect(findings.map((f) => [f.rule, f.line])).toEqual([
			["status", 4],
			["date", 5],
		]);
		expect(findings[0]?.reason).toBe(
			'invalid status "done" — must be one of: proposed, accepted, rejected, deprecated, superseded'
		);
		expect(findings[1]?.reason).toBe('invalid date "May 1" — must be YYYY-MM-DD');
	});

	it("warns (not errors) when an accepted ADR has no discussion link", () => {
		expect(validateAdr(file, GOOD_ADR.replace(/^discussion: .*\n/m, ""))).toEqual([
			{
				file,
				line: 4,
				rule: "discussion",
				reason: "status is accepted but `discussion.github` is not set",
				severity: "warning",
			},
		]);
	});

	it("accepts the template's nested discussion.github link", () => {
		const nested = GOOD_ADR.replace(/^discussion: .*$/m, "discussion:\n  github: https://github.com/o/r/pull/1");
		expect(validateAdr(file, nested)).toEqual([]);
	});

	it("still warns when the nested discussion.github is empty", () => {
		const empty = GOOD_ADR.replace(/^discussion: .*$/m, "discussion:\n  github:");
		expect(validateAdr(file, empty).map((f) => [f.rule, f.severity])).toEqual([["discussion", "warning"]]);
	});

	it("does not ask for a discussion link on an ADR that is not accepted", () => {
		const proposed = GOOD_ADR.replace("status: accepted", "status: proposed").replace(/^discussion: .*\n/m, "");
		expect(validateAdr(file, proposed)).toEqual([]);
	});

	it("skips the sequence rule for a file without a numeric prefix", () => {
		expect(validateAdr("docs/wiki/decisions/naming.md", GOOD_ADR.replace("ADR-0009", "ADR-whatever"))).toEqual([]);
	});

	it("reads the sequence from the file's own name, not a folder in its path", () => {
		expect(validateAdr("0001-x/0009-task-manifest.md", GOOD_ADR)).toEqual([]);
	});
});
