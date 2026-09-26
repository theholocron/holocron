import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintFormatting } from "./lint-formatting.js";

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

describe("lintFormatting — a clean file", () => {
	it("fetches the PR's changed files, reads the PR ref's content, and reports valid", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [file("src/index.js")] },
			{ status: 200, body: contentsBody("const x = 1;\n") },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 42, ref: "pr-head-sha" });

		expect(calls[0]?.url).toContain("/repos/acme/demo/pulls/42/files");
		expect(calls[1]?.url).toContain("/repos/acme/demo/contents/src/index.js");
		expect(calls[1]?.url).toContain("ref=pr-head-sha");
		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});
});

describe("lintFormatting — a file that needs reformatting", () => {
	it("catches real formatting issues, anchored at the first differing line", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/index.js")] },
			{ status: 200, body: contentsBody("const   x=1") },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fileCount).toBe(1);
		expect(result.messages).toEqual([
			{
				file: "src/index.js",
				line: 1,
				reason: "Not formatted according to this org's shared prettier config — run `prettier --write` to fix.",
				formatted: "const x = 1;\n",
			},
		]);
	});

	it("anchors the message at the first line that actually differs, not always line 1", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("src/index.js")] },
			{ status: 200, body: contentsBody("const a = 1;\nconst   b=2") },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.messages[0]?.line).toBe(2);
	});
});

describe("lintFormatting — scoping", () => {
	it("skips a file with no inferrable prettier parser, without fetching its content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("LICENSE")] }]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips files matching PRETTIER_IGNORE_PATTERNS, without fetching their content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("CHANGELOG.md"), file(".github/foo.yml")] }]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips a removed file even if it would otherwise be checked", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("src/deleted.js", "removed")] }]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("checks a markdown file too, not just JS -- prettier's own parser inference, not a hardcoded extension list", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("# Title\n") },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});
});

describe("lintFormatting — PRETTIER_CONFIG.overrides resolution (holocron#829 follow-up)", () => {
	// Found live on a real PR: a 2-space-indented JSON file was flagged as
	// needing reformatting -- PRETTIER_CONFIG.overrides (*.json ->
	// tabWidth:2/useTabs:false) was silently never applied, since check()/
	// format() only accept Options, which has no overrides key at all. This
	// content is only valid under that override; the base config's
	// useTabs:true would flag it and want to convert it to tabs.
	it("applies the *.json override (tabWidth 2, useTabs false), not the base config's useTabs: true", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("packages/cli/src/templates/configs/alexjs/alexrc.json")] },
			{ status: 200, body: contentsBody('{\n  "allow": ["dead", "execute"]\n}\n') },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});

	it("applies the *.md override the same way, not the base config's tab-based indentation", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("docs/guide.md")] },
			{ status: 200, body: contentsBody("# Title\n\n- one\n- two\n") },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});

	it("applies both matching overrides cumulatively for tsconfig.json -- *.json's tabWidth/useTabs AND tsconfig*.json's printWidth: 80, not just the first match", async () => {
		// 90 chars wide: fits under the base/*.json printWidth (120) but not
		// under tsconfig*.json's own printWidth: 80 -- only reformats if that
		// second, more specific override actually layered on top.
		const wideLine =
			'{\n  "compilerOptions": { "strict": true, "target": "ES2022", "moduleResolution": "NodeNext" }\n}\n';
		const { client } = makeClient([
			{ status: 200, body: [file("tsconfig.json")] },
			{ status: 200, body: contentsBody(wideLine) },
		]);

		const result = await lintFormatting({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages[0]?.formatted).toContain("\n    ");
	});
});
