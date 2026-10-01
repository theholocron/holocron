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

[*.md]
trim_trailing_whitespace = false
`;

describe("lintEditorConfig — no .editorconfig at all", () => {
	it("reports valid with nothing checked, without fetching any changed-file content", async () => {
		const { client, calls } = makeClient([{ status: 404, body: { message: "Not Found" } }]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
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
		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
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
	});

	it("catches space indentation when indent_style is tab", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("function f() {\n  return 1;\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([{ file: "src/index.ts", line: 2, reason: "Expected tab indentation." }]);
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
	});

	it("passes a clean CRLF file when end_of_line is crlf -- no bare LF present", async () => {
		const crlfConfig = "root = true\n\n[*]\nend_of_line = crlf\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(crlfConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("const a = 1;\r\nconst b = 2;\r\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});

	it("catches tab indentation when indent_style is space", async () => {
		const spaceConfig = "root = true\n\n[*]\nindent_style = space\n";
		const { client } = makeClient([
			{ status: 200, body: contentsBody(spaceConfig) },
			{ status: 200, body: [file("src/index.ts")] },
			{ status: 200, body: contentsBody("function f() {\n\treturn 1;\n}\n") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages).toEqual([{ file: "src/index.ts", line: 2, reason: "Expected space indentation." }]);
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
	});

	it("reports every distinct violation on the same file", async () => {
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

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});
});

describe("lintEditorConfig — scoping", () => {
	it("skips a removed file even if it would otherwise be checked", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/deleted.ts", "removed")] },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(2);
	});

	it("skips checking .editorconfig against itself", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file(".editorconfig")] },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(2);
	});

	it("skips an empty file without throwing", async () => {
		const { client } = makeClient([
			{ status: 200, body: contentsBody(BASE_EDITORCONFIG) },
			{ status: 200, body: [file("src/empty.ts")] },
			{ status: 200, body: contentsBody("") },
		]);

		const result = await lintEditorConfig({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});
});
