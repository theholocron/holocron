import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintMarkdown } from "./lint-markdown.js";

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

describe("lintMarkdown — a clean file", () => {
	it("fetches the PR's changed files, reads the PR ref's content, and reports valid", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("# Title\n\nSome text.\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 42, ref: "pr-head-sha" });

		expect(calls[0]?.url).toContain("/repos/acme/demo/pulls/42/files");
		expect(calls[1]?.url).toContain("/repos/acme/demo/contents/README.md");
		expect(calls[1]?.url).toContain("ref=pr-head-sha");
		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});
});

describe("lintMarkdown — a file with real findings", () => {
	it("catches a genuine markdownlint violation (heading levels skip a level)", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("# Title\n\n### Skipped a level\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fileCount).toBe(1);
		expect(result.messages[0]?.file).toBe("README.md");
		expect(result.messages[0]?.ruleNames).toContain("MD001");
		// @theholocron/markdownlint-config doesn't configure a per-rule severity today (holocron#860) --
		// markdownlint's own default of "error" applies to every rule until that's curated.
		expect(result.messages[0]?.severity).toBe("error");
		// MD001 (heading-increment) has no deterministic fix -- there's no
		// single correct heading level to guess at.
		expect(result.fixes).toEqual([]);
	});

	it("doesn't flag a long unwrapped prose line -- line-length (MD013) conflicts with Prettier's own proseWrap: preserve", async () => {
		const longLine = `Some prose that just keeps going and going without wrapping. ${"word ".repeat(30)}`;
		const { client } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody(`# Title\n\n${longLine}\n`) },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(true);
	});
});

describe("lintMarkdown — auto-fix", () => {
	it("computes a fix for a rule with a deterministic fixInfo (MD004 ul-style, not overlapping Prettier's territory)", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("# Title\n\n* item one\n+ item two\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages.some((m) => m.ruleNames.includes("MD004"))).toBe(true);
		expect(result.fixes).toEqual([{ file: "README.md", fixed: "# Title\n\n* item one\n* item two\n" }]);
	});

	it("doesn't produce a fix for a rule with no fixInfo at all, even though it's still flagged", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("# Title\n\n### Skipped a level\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fixes).toEqual([]);
	});

	it("only includes files applyFixes() actually changed, across multiple files", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("fixable.md"), file("unfixable.md"), file("clean.md")] },
			{ status: 200, body: contentsBody("# Title\n\n* item one\n+ item two\n") },
			{ status: 200, body: contentsBody("# Title\n\n### Skipped a level\n") },
			{ status: 200, body: contentsBody("# Title\n\nClean.\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.fixes).toEqual([{ file: "fixable.md", fixed: "# Title\n\n* item one\n* item two\n" }]);
	});

	it("produces no fixes for a clean file", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("# Title\n\nSome text.\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.fixes).toEqual([]);
	});
});

describe("lintMarkdown — scoping", () => {
	it("skips a non-markdown file entirely, without fetching its content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("src/index.ts")] }]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [], fixes: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips files matching ALEX_IGNORE_PATTERNS, without fetching their content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("CHANGELOG.md"), file(".github/foo.md")] }]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [], fixes: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips a removed file even if it would otherwise be checked", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("docs/deleted.md", "removed")] }]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [], fixes: [] });
		expect(calls).toHaveLength(1);
	});

	it("checks an .mdx file too, not just .md", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("docs/guide.mdx")] },
			{ status: 200, body: contentsBody("# Title\n\nSome text.\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
	});

	describe("an MDX comment (holocron#1950)", () => {
		// What looped on #1949: markdownlint read the spaces inside the comment as spaces inside emphasis (MD037) and
		// its fix removed them, and prettier's MDX formatting put them back.
		const mdxComment = "# Title\n\nA cell {/* holocron-allow-old-name */}\n";

		it("is flagged and rewritten in an .md file, where the same text is emphasis", async () => {
			const { client } = makeClient([
				{ status: 200, body: [file("docs/probe.md")] },
				{ status: 200, body: contentsBody(mdxComment) },
			]);

			const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

			expect(result.messages.map((m) => m.ruleNames)).toContainEqual(expect.arrayContaining(["MD037"]));
			expect(result.fixes).toHaveLength(1);
		});

		it("is left alone in an .mdx file: no finding and no fix", async () => {
			const { client } = makeClient([
				{ status: 200, body: [file("docs/probe.mdx")] },
				{ status: 200, body: contentsBody(mdxComment) },
			]);

			const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

			expect(result).toEqual({ valid: true, fileCount: 1, messages: [], fixes: [] });
		});

		it("still reports real emphasis with spaces inside in an .mdx file, outside any comment", async () => {
			const { client } = makeClient([
				{ status: 200, body: [file("docs/probe.mdx")] },
				{ status: 200, body: contentsBody("# Title\n\nHere is some * emphasized * text.\n") },
			]);

			const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

			expect(result.messages.map((m) => m.ruleNames)).toContainEqual(expect.arrayContaining(["MD037"]));
			expect(result.fixes).toHaveLength(1);
		});

		it("reports only the real emphasis when a comment and real emphasis share an .mdx file, and fixes only that", async () => {
			const { client } = makeClient([
				{ status: 200, body: [file("docs/probe.mdx")] },
				{
					status: 200,
					body: contentsBody(
						"# Title\n\nA cell {/* holocron-allow-old-name */}\n\nHere is some * emphasized * text.\n"
					),
				},
			]);

			const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

			expect(result.messages.map((m) => m.line)).toEqual([5, 5]);
			expect(result.fixes).toHaveLength(1);
			expect(result.fixes[0]!.fixed).toContain("{/* holocron-allow-old-name */}");
			expect(result.fixes[0]!.fixed).toContain("Here is some *emphasized* text.");
		});

		it("still reports every other rule in an .mdx file", async () => {
			const { client } = makeClient([
				{ status: 200, body: [file("docs/probe.mdx")] },
				{ status: 200, body: contentsBody("# A\n\n### skipped\n\nA cell {/* x */}\n") },
			]);

			const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

			expect(result.messages.map((m) => m.ruleNames[0])).toEqual(["MD001"]);
		});

		it("lints an .md and an .mdx file in the same pull request, each with its own config", async () => {
			const { client } = makeClient([
				{ status: 200, body: [file("a.md"), file("b.mdx")] },
				{ status: 200, body: contentsBody(mdxComment) },
				{ status: 200, body: contentsBody(mdxComment) },
			]);

			const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

			expect(result.fileCount).toBe(2);
			expect([...new Set(result.messages.map((m) => m.file))]).toEqual(["a.md"]);
		});
	});
});

describe("lintMarkdown — batching (one lint() call, not one per file)", () => {
	it("attributes findings to the correct file when multiple files are linted together", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("a.md"), file("b.md")] },
			{ status: 200, body: contentsBody("# A\n\nclean.\n") },
			{ status: 200, body: contentsBody("# B\n\n### skipped\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result.fileCount).toBe(2);
		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]?.file).toBe("b.md");
	});
});
