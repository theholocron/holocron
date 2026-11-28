import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintFormatting } from "./lint-formatting.js";

// Only the changes on lines the pull request added are committed (holocron#1950): every unformatted file is still
// reported, but the auto-fix commit never writes a line the pull request left alone.

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

const modified = (filename: string, patch?: string) => ({ filename, status: "modified", ...(patch ? { patch } : {}) });

// Lines 1 and 3 need formatting; line 2 is fine, so prettier's fix is two separate hunks.
const JS = "const   a=1;\nconst b = 2;\nconst   c=3;\n";

describe("lintFormatting: scoped fix", () => {
	it("commits the change to a line the pull request added and leaves an unformatted line it did not touch", async () => {
		const client = makeClient([
			{ status: 200, body: [modified("src/index.js", "@@ -2,1 +2,2 @@\n const b = 2;\n+const   c=3;")] },
			{ status: 200, body: contentsBody(JS) },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages[0]!.formatted).toBe("const a = 1;\nconst b = 2;\nconst c = 3;\n");
		expect(result.messages[0]!.scopedFix).toBe("const   a=1;\nconst b = 2;\nconst c = 3;\n");
	});

	it("still reports a file whose unformatted lines are all ones the pull request did not add, with no scoped fix", async () => {
		const client = makeClient([
			{ status: 200, body: [modified("src/index.js", "@@ -2,0 +2,1 @@\n+const b = 2;")] },
			{ status: 200, body: contentsBody(JS) },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]!.scopedFix).toBeNull();
	});

	it("keeps a run of changed lines together: a table re-padded for one added row is fixed as a whole", async () => {
		const table = "| a | b |\n| - | - |\n| 1 | 2 |\n| 3 | 44444 |\n";
		const client = makeClient([
			{ status: 200, body: [modified("docs/table.md", "@@ -3,0 +4,1 @@\n+| 3 | 44444 |")] },
			{ status: 200, body: contentsBody(table) },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.messages[0]!.scopedFix).toBe(result.messages[0]!.formatted);
	});

	it("takes the whole fix when GitHub sent no patch for the file", async () => {
		const client = makeClient([
			{ status: 200, body: [modified("src/index.js")] },
			{ status: 200, body: contentsBody(JS) },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.messages[0]!.scopedFix).toBe(result.messages[0]!.formatted);
	});
});
