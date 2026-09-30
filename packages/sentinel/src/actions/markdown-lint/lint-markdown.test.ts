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
		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
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

describe("lintMarkdown — scoping", () => {
	it("skips a non-markdown file entirely, without fetching its content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("src/index.ts")] }]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips files matching ALEX_IGNORE_PATTERNS, without fetching their content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("CHANGELOG.md"), file(".github/foo.md")] }]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips a removed file even if it would otherwise be checked", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("docs/deleted.md", "removed")] }]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("checks an .mdx file too, not just .md", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("docs/guide.mdx")] },
			{ status: 200, body: contentsBody("# Title\n\nSome text.\n") },
		]);

		const result = await lintMarkdown({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
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
