import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintEditorConfig } from "./lint-editorconfig.js";

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

const BASE_EDITORCONFIG = `root = true

[*]
end_of_line = lf
trim_trailing_whitespace = true
insert_final_newline = true
indent_style = tab
indent_size = 4

[*.md]
trim_trailing_whitespace = false
`;

describe("lintEditorConfig — no .editorconfig at all", () => {
	it("reports valid with nothing checked, without fetching any changed-file content", async () => {
		const { client, calls } = makeClient([{ status: 404, body: { message: "Not Found" } }]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [], fixes: [] });
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toContain("/repos/acme/demo/contents/.editorconfig");
	});
});

describe("lintEditorConfig — a clean file", () => {
	it("fetches the .editorconfig, the PR's changed files, reads each ref's content, and reports valid", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("export const x = 1;\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 42, ref: "pr-head-sha" });

		expect(calls[0]?.url).toContain("/repos/acme/demo/contents/.editorconfig");
		expect(calls[1]?.url).toContain("/repos/acme/demo/pulls/42/files");
		expect(calls[2]?.url).toContain("/repos/acme/demo/contents/src/index.ts");
		expect(calls[2]?.url).toContain("ref=pr-head-sha");
		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});
});

describe("lintEditorConfig — real violations", () => {
	it("catches trailing whitespace", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const x = 1;   \n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([{ file: "src/index.ts", line: 1, reason: "Trailing whitespace." }]);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "const x = 1;\n" }]);
	});

	it("catches a missing final newline", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const x = 1;") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([{ file: "src/index.ts", line: 1, reason: "Missing final newline." }]);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "const x = 1;\n" }]);
	});

	it("catches space indentation when indent_style is tab, but leaves the ambiguous (non-multiple-of-indent_size) indent unfixed", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("function f() {\n  return 1;\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([{ file: "src/index.ts", line: 2, reason: "Expected tab indentation." }]);
		// 2 leading spaces isn't a clean multiple of indent_size: 4 -- fixIndent
		// bails rather than guess, so there's nothing to commit for this file.
		expect(result.fixes).toEqual([]);
	});

	it("fixes space indentation to tabs when the leading spaces are a clean multiple of indent_size", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("function f() {\n    return 1;\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "function f() {\n\treturn 1;\n}\n" }]);
	});

	it("catches a bare LF where CRLF is expected", async () => {
		const crlfConfig = "root = true\n\n[*]\nend_of_line = crlf\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(crlfConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const a = 1;\r\nconst b = 2;\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([
			{ file: "src/index.ts", line: 2, reason: "Expected CRLF line endings, found a bare LF." },
		]);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "const a = 1;\r\nconst b = 2;\r\n" }]);
	});

	it("passes a clean CRLF file when end_of_line is crlf -- no bare LF present", async () => {
		const crlfConfig = "root = true\n\n[*]\nend_of_line = crlf\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(crlfConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const a = 1;\r\nconst b = 2;\r\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});

	it("catches tab indentation when indent_style is space, fixing it when indent_size is known", async () => {
		const spaceConfig = "root = true\n\n[*]\nindent_style = space\nindent_size = 2\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(spaceConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("function f() {\n\treturn 1;\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([{ file: "src/index.ts", line: 2, reason: "Expected space indentation." }]);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "function f() {\n  return 1;\n}\n" }]);
	});

	it("leaves an already-tab-indented line untouched while fixing a space-indented sibling", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("if (x) {\n\tok();\n    bad();\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "if (x) {\n\tok();\n\tbad();\n}\n" }]);
	});

	it("leaves an already-space-indented line untouched while fixing a tab-indented sibling (indent_style: space)", async () => {
		const spaceConfig = "root = true\n\n[*]\nindent_style = space\nindent_size = 2\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(spaceConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("if (x) {\n  ok();\n\tbad();\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "if (x) {\n  ok();\n  bad();\n}\n" }]);
	});

	it("falls back to detecting the file's own CRLF line endings for rejoining when end_of_line isn't set", async () => {
		const noEolConfig = "root = true\n\n[*]\ninsert_final_newline = true\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(noEolConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const a = 1;\r\nconst b = 2;") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "const a = 1;\r\nconst b = 2;\r\n" }]);
	});

	it("fixes a space-indented line that already starts with a tab (mixed leading whitespace)", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("if (x) {\n\t    return 1;\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "if (x) {\n\t\treturn 1;\n}\n" }]);
	});

	it("leaves indent_style unfixed (but still flagged) when indent_size can't be resolved (defaults to the 'tab' sentinel)", async () => {
		// No explicit indent_size alongside indent_style -- the editorconfig
		// package's own matcher() defaults indent_size to the string "tab" in
		// this case, not a number, so fixContent can't safely convert.
		const noSizeConfig = "root = true\n\n[*]\nindent_style = space\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(noSizeConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("function f() {\n\treturn 1;\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes).toEqual([]);
	});

	it("catches a file ending in a newline when insert_final_newline is false", async () => {
		const noFinalNewlineConfig = "root = true\n\n[*]\ninsert_final_newline = false\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(noFinalNewlineConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const x = 1;\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([
			{ file: "src/index.ts", line: 2, reason: "File should not end with a newline." },
		]);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "const x = 1;" }]);
	});

	it("catches a CRLF where LF is expected", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const a = 1;\r\nconst b = 2;\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages[0]).toEqual({
			file: "src/index.ts",
			line: 1,
			reason: "Expected LF line endings, found CRLF.",
		});
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "const a = 1;\nconst b = 2;\n" }]);
	});

	it("reports every distinct violation on the same file, with one fix covering both", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const x = 1;   ") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.messages).toEqual([
			{ file: "src/index.ts", line: 1, reason: "Trailing whitespace." },
			{ file: "src/index.ts", line: 1, reason: "Missing final newline." },
		]);
		expect(result.fixes).toEqual([{ file: "src/index.ts", fixed: "const x = 1;\n" }]);
	});
});

describe("lintEditorConfig — block-comment alignment false positive", () => {
	it("doesn't flag a correctly-aligned JSDoc block in tab-indented code", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{
				status: 200,
				body: contentsBody("function f() {\n\t/**\n\t * A comment.\n\t */\n\treturn 1;\n}\n"),
			},
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});

	it("doesn't flag a correctly-aligned JSDoc block in space-indented code", async () => {
		const spaceConfig = "root = true\n\n[*]\nindent_style = space\nindent_size = 2\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(spaceConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{
				status: 200,
				body: contentsBody("function f() {\n  /**\n   * A comment.\n   */\n  return 1;\n}\n"),
			},
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});

	it("doesn't flag a comment continuation line with no alignment space at all", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("function f() {\n\t/**\n\t* A comment.\n\t*/\n\treturn 1;\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});

	it("still flags the comment block's own opening line when its real indentation is wrong", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{
				status: 200,
				body: contentsBody("function f() {\n    /**\n     * A comment.\n     */\n\treturn 1;\n}\n"),
			},
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([{ file: "src/index.ts", line: 2, reason: "Expected tab indentation." }]);
		// 4 spaces is a clean multiple of indent_size -- the opening line's
		// real indentation converts; the continuation lines' own alignment
		// space is preserved, not corrupted into an extra tab.
		expect(result.fixes).toEqual([
			{ file: "src/index.ts", fixed: "function f() {\n\t/**\n\t * A comment.\n\t */\n\treturn 1;\n}\n" },
		]);
	});

	it("still flags a continuation line whose own real indentation (before the alignment space) is wrong", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{
				status: 200,
				body: contentsBody("function f() {\n\t/**\n     * A comment.\n\t */\n\treturn 1;\n}\n"),
			},
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([{ file: "src/index.ts", line: 3, reason: "Expected tab indentation." }]);
		expect(result.fixes).toEqual([
			{ file: "src/index.ts", fixed: "function f() {\n\t/**\n\t * A comment.\n\t */\n\treturn 1;\n}\n" },
		]);
	});
});

describe("lintEditorConfig — cascading overrides", () => {
	it("applies the [*.md] override (trim_trailing_whitespace: false), not the base [*] section", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("# Title   \n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});
});

describe("lintEditorConfig — scoping", () => {
	it("skips a removed file even if it would otherwise be checked", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/deleted.ts", "removed")] },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [], fixes: [] });
		expect(calls).toHaveLength(2);
	});

	it("skips checking .editorconfig against itself", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file(".editorconfig")] },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [], fixes: [] });
		expect(calls).toHaveLength(2);
	});

	it("skips an empty file without throwing", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/empty.ts")] },
			{ status: 200, body: contentsBody("") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});
});
