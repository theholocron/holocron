import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintMarkdown } from "./lint-markdown.js";

// Only the lines the pull request added are fixed (holocron#1950): every finding is still reported, but the
// auto-fix commit never writes a line the pull request left alone.

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch } = stubFetch(responses);
	return createGitHubClient({ token: "ghp_test", fetch });
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

// MD004 (ul-style) has a deterministic fix: a list marker changed to the first one the file uses.
const TEXT = "# Title\n\n* one\n- two\n- three\n";
const modified = (patch?: string) => ({ filename: "list.md", status: "modified", ...(patch ? { patch } : {}) });

describe("lintMarkdown: scoped fix", () => {
	it("fixes the list marker on a line the pull request added and leaves the one beside it", async () => {
		const client = makeClient([
			{ status: 200, body: [modified("@@ -3,2 +3,3 @@\n * one\n - two\n+- three")] },
			{ status: 200, body: contentsBody(TEXT) },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages.length).toBeGreaterThan(1);
		expect(result.fixes).toEqual([
			{
				file: "list.md",
				fixed: "# Title\n\n* one\n* two\n* three\n",
				scopedFix: "# Title\n\n* one\n- two\n* three\n",
			},
		]);
	});

	it("has no scoped fix when every flagged line is one the pull request did not add", async () => {
		const client = makeClient([
			{ status: 200, body: [modified("@@ -1,0 +1,1 @@\n+# Title")] },
			{ status: 200, body: contentsBody(TEXT) },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes.map((f) => f.scopedFix)).toEqual([null]);
	});

	it("takes the whole fix when GitHub sent no patch for the file", async () => {
		const client = makeClient([
			{ status: 200, body: [modified()] },
			{ status: 200, body: contentsBody(TEXT) },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.fixes[0]!.scopedFix).toBe(result.fixes[0]!.fixed);
	});
});
