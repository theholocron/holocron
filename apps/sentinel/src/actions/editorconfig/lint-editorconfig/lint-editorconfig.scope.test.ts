import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintEditorConfig } from "./lint-editorconfig.js";

// Only the lines the pull request added are fixed (holocron#1950): every violation is still reported, but the
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

const EDITORCONFIG =
	"root = true\n\n[*]\nend_of_line = lf\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n";
const TEXT = "const a = 1;   \nconst b = 2;   \nconst c = 3;   \n";
const modified = (patch?: string) => ({ filename: "src/index.ts", status: "modified", ...(patch ? { patch } : {}) });

describe("lintEditorConfig: scoped fix", () => {
	it("reports every violation but fixes only the line the pull request added, even between two untouched ones", async () => {
		const client = makeClient([
			{ status: 200, body: contentsBody(EDITORCONFIG) },
			{ status: 200, body: [modified("@@ -1,2 +1,3 @@\n const a = 1;   \n+const b = 2;   \n const c = 3;   ")] },
			{ status: 200, body: contentsBody(TEXT) },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toHaveLength(1);
		expect(result.fixes).toEqual([
			{
				file: "src/index.ts",
				fixed: "const a = 1;\nconst b = 2;\nconst c = 3;\n",
				scopedFix: "const a = 1;   \nconst b = 2;\nconst c = 3;   \n",
			},
		]);
	});

	it("has no scoped fix for a file whose violations are all on lines the pull request did not add", async () => {
		const client = makeClient([
			{ status: 200, body: contentsBody(EDITORCONFIG) },
			{ status: 200, body: [modified("@@ -3,0 +4,1 @@\n+const d = 4;")] },
			{ status: 200, body: contentsBody(`${TEXT}const d = 4;\n`) },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes.map((f) => f.scopedFix)).toEqual([null]);
	});

	it("takes the whole fix when GitHub sent no patch for the file", async () => {
		const client = makeClient([
			{ status: 200, body: contentsBody(EDITORCONFIG) },
			{ status: 200, body: [modified()] },
			{ status: 200, body: contentsBody(TEXT) },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.fixes[0]!.scopedFix).toBe(result.fixes[0]!.fixed);
	});
});
