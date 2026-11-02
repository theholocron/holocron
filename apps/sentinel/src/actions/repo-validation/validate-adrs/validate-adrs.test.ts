import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { validateAdrs } from "./validate-adrs.js";

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

const GOOD_SPEC = md("---", "id: SPEC-0001", "status: draft", "issue: theholocron/holocron#913", "---", "", "# Spec");

describe("validateAdrs", () => {
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
			{ status: 200, body: contentsBody(GOOD_SPEC.replace("SPEC-0001", "SPEC-0002")) },
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
			[".notes/tech-x.spec.md", "id", "warning"],
			[".notes/tech-x.spec.md", "issue", "warning"],
		]);
	});

	it("reports valid with zero files when the PR touches no ADR or spec", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("README.md")] }]);

		const result = await validateAdrs({ client, repo: "acme/demo", pullNumber: 4, ref: "sha" });

		expect(calls).toHaveLength(1);
		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
	});

	it("reports each finding with its file and the field's own line, from the shared rules", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("docs/wiki/decisions/0009-task-manifest.md", "added")] },
			{ status: 200, body: contentsBody(GOOD_ADR.replace("status: accepted", "status: done")) },
		]);

		const result = await validateAdrs({ client, repo: "acme/demo", pullNumber: 4, ref: "sha" });

		expect(result).toEqual({
			valid: false,
			fileCount: 1,
			messages: [
				{
					file: "docs/wiki/decisions/0009-task-manifest.md",
					line: 4,
					rule: "status",
					reason: 'invalid status "done" — must be one of: proposed, accepted, rejected, deprecated, superseded',
					severity: "error",
				},
			],
		});
	});

	it("is not valid for a warning alone, which the check run reports as neutral", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file(".notes/tech-x.spec.md")] },
			{ status: 200, body: contentsBody(md("---", "id: SPEC-0001", "status: draft", "---")) },
		]);

		const result = await validateAdrs({ client, repo: "acme/demo", pullNumber: 4, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages.map((m) => m.severity)).toEqual(["warning"]);
	});

	it("reads nothing when every changed ADR or spec was removed", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: [file("docs/wiki/decisions/0001-old.md", "removed"), file(".notes/gone.spec.md", "removed")],
			},
		]);

		const result = await validateAdrs({ client, repo: "acme/demo", pullNumber: 4, ref: "sha" });

		expect(calls).toHaveLength(1);
		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
	});
});
