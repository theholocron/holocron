import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { parseFrontmatter, validateAdr, validateAdrs, validateSpec } from "./validate-adrs.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

function file(filename: string, status: "added" | "modified" | "removed" = "modified") {
	return { filename, status };
}

function contentsBody(text: string) {
	return {
		content: Buffer.from(text, "utf8").toString("base64"),
		encoding: "base64",
		sha: "x",
		name: "x",
		path: "x",
	};
}

/** Joins lines with a trailing newline — keeps fixtures one source line per markdown line. */
function md(...lines: string[]): string {
	return `${lines.join("\n")}\n`;
}

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

const GOOD_SPEC = md("---", "status: draft", "issue: theholocron/holocron#913", "---", "", "# Spec");

describe("parseFrontmatter", () => {
	it("reads flat key: value fields with their 1-indexed line numbers", () => {
		const fm = parseFrontmatter(md("---", "status: draft", "issue: x#1", "---"));
		expect(fm?.get("status")).toEqual({ value: "draft", line: 2 });
		expect(fm?.get("issue")).toEqual({ value: "x#1", line: 3 });
	});

	it("skips lines that aren't flat key: value fields, keeping later fields' line numbers", () => {
		const fm = parseFrontmatter(md("---", "discussion:", "  github: x", "# comment", "status: draft", "---"));
		expect([...fm!.keys()]).toEqual(["discussion", "status"]);
		expect(fm?.get("status")).toEqual({ value: "draft", line: 5 });
	});

	it("returns null when the file doesn't open with a frontmatter block", () => {
		expect(parseFrontmatter("# Just a heading\n")).toBeNull();
	});
});

describe("validateAdr — the script's rules", () => {
	const file0009 = "docs/wiki/decisions/0009-task-manifest.md";

	it("passes a well-formed accepted ADR", () => {
		expect(validateAdr(file0009, GOOD_ADR)).toEqual([]);
	});

	it("flags a missing frontmatter block", () => {
		expect(validateAdr(file0009, "# No frontmatter\n")).toEqual([
			{ file: file0009, line: 1, rule: "frontmatter", reason: "no frontmatter found", severity: "error" },
		]);
	});

	it("flags an id that doesn't match the filename's sequence, at the id's own line", () => {
		const messages = validateAdr(file0009, GOOD_ADR.replace("id: ADR-0009", "id: ADR-0010"));
		expect(messages).toEqual([
			{
				file: file0009,
				line: 2,
				rule: "id",
				reason: 'id "ADR-0010" does not match filename sequence (expected ADR-0009)',
				severity: "error",
			},
		]);
	});

	it("flags every missing required field at line 1, plus an empty title", () => {
		const messages = validateAdr(file0009, md("---", "title: ''", "---"));
		expect(messages.map((m) => [m.rule, m.line, m.reason])).toEqual([
			["id", 1, "missing `id` field"],
			["title", 2, "missing or empty `title` field"],
			["status", 1, "missing `status` field"],
			["date", 1, "missing `date` field"],
		]);
	});

	it('treats a title of "" as empty too', () => {
		const messages = validateAdr(file0009, GOOD_ADR.replace("title: Task manifest", 'title: ""'));
		expect(messages.map((m) => m.rule)).toEqual(["title"]);
	});

	it("flags an unknown status and a non-ISO date", () => {
		const messages = validateAdr(
			file0009,
			GOOD_ADR.replace("status: accepted", "status: done").replace("date: 2026-05-01", "date: May 1")
		);
		expect(messages.map((m) => [m.rule, m.line])).toEqual([
			["status", 4],
			["date", 5],
		]);
		expect(messages[0]?.reason).toBe(
			'invalid status "done" — must be one of: proposed, accepted, rejected, deprecated, superseded'
		);
	});

	it("warns (not errors) when an accepted ADR has no discussion link", () => {
		const messages = validateAdr(file0009, GOOD_ADR.replace(/^discussion: .*\n/m, ""));
		expect(messages).toEqual([
			{
				file: file0009,
				line: 4,
				rule: "discussion",
				reason: "status is accepted but `discussion.github` is not set",
				severity: "warning",
			},
		]);
	});

	it("skips the sequence rule for a file without a numeric prefix", () => {
		expect(validateAdr("docs/wiki/decisions/naming.md", GOOD_ADR.replace("ADR-0009", "ADR-whatever"))).toEqual([]);
	});
});

describe("validateSpec — the script's rules", () => {
	const spec = ".notes/tech-x.spec.md";

	it("passes a spec with a known status and an issue", () => {
		expect(validateSpec(spec, GOOD_SPEC)).toEqual([]);
	});

	it("flags a missing frontmatter block", () => {
		expect(validateSpec(spec, "# No frontmatter\n").map((m) => m.rule)).toEqual(["frontmatter"]);
	});

	it("flags a missing or unknown status", () => {
		expect(validateSpec(spec, md("---", "issue: x#1", "---"))).toEqual([
			{ file: spec, line: 1, rule: "status", reason: "missing `status` field", severity: "error" },
		]);
		expect(validateSpec(spec, md("---", "status: shipped", "issue: x#1", "---"))[0]).toMatchObject({
			line: 2,
			rule: "status",
			severity: "error",
		});
	});

	it("warns on a missing issue, except for archived and superseded specs", () => {
		expect(validateSpec(spec, md("---", "status: draft", "---"))).toEqual([
			{
				file: spec,
				line: 1,
				rule: "issue",
				reason: "missing `issue` field — every spec must have a companion GitHub issue",
				severity: "warning",
			},
		]);
		expect(validateSpec(spec, md("---", "status: archived", "---"))).toEqual([]);
		expect(validateSpec(spec, md("---", "status: superseded", "---"))).toEqual([]);
	});
});

describe("validateAdrs — which files it reads", () => {
	it("reads only the PR's non-removed ADRs and specs, at the PR's own ref", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: [
					file("docs/wiki/decisions/0009-task-manifest.md"),
					file("docs/wiki/decisions/template.md"),
					file("docs/wiki/decisions/README.md"),
					file("docs/wiki/decisions/0001-old.md", "removed"),
					file(".notes/tech-x.spec.md", "added"),
					file("docs/wiki/specifications/tool-y.spec.md"),
					file(".notes/scratch.md"),
					file("docs/wiki/decisions/nested/0002-x.md"),
					file("src/index.ts"),
				],
			},
			{ status: 200, body: contentsBody(GOOD_ADR) },
			{ status: 200, body: contentsBody(GOOD_SPEC) },
			{ status: 200, body: contentsBody(GOOD_SPEC) },
		]);

		const result = await validateAdrs({ client, repo: "acme/demo", pullNumber: 4, ref: "pr-head" });

		expect(calls.slice(1).map((c) => decodeURIComponent(c.url))).toEqual([
			expect.stringContaining("/contents/docs/wiki/decisions/0009-task-manifest.md?ref=pr-head"),
			expect.stringContaining("/contents/.notes/tech-x.spec.md?ref=pr-head"),
			expect.stringContaining("/contents/docs/wiki/specifications/tool-y.spec.md?ref=pr-head"),
		]);
		expect(result).toEqual({ valid: true, fileCount: 3, messages: [] });
	});

	it("routes each file to the ADR or spec rules and collects every finding", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("docs/wiki/decisions/0009-task-manifest.md"), file(".notes/tech-x.spec.md")] },
			{ status: 200, body: contentsBody(GOOD_ADR.replace("ADR-0009", "ADR-0001")) },
			{ status: 200, body: contentsBody(md("---", "status: draft", "---")) },
		]);

		const result = await validateAdrs({ client, repo: "acme/demo", pullNumber: 4, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages.map((m) => [m.file, m.rule, m.severity])).toEqual([
			["docs/wiki/decisions/0009-task-manifest.md", "id", "error"],
			[".notes/tech-x.spec.md", "issue", "warning"],
		]);
	});

	it("reports valid with zero files when the PR touches no ADR or spec", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("README.md")] }]);

		const result = await validateAdrs({ client, repo: "acme/demo", pullNumber: 4, ref: "sha" });

		expect(calls).toHaveLength(1);
		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
	});
});
