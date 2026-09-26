import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintInclusiveLanguage } from "./lint-inclusive-language.js";

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

describe("lintInclusiveLanguage — a clean file", () => {
	it("fetches the PR's changed files, reads the PR ref's content, and reports valid", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("This is a perfectly fine sentence.") },
		]);

		const result = await lintInclusiveLanguage({ client, repo: "acme/demo", pullNumber: 42, ref: "pr-head-sha" });

		expect(calls[0]?.url).toContain("/repos/acme/demo/pulls/42/files");
		expect(calls[1]?.url).toContain("/repos/acme/demo/contents/README.md");
		expect(calls[1]?.url).toContain("ref=pr-head-sha");
		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});
});

describe("lintInclusiveLanguage — a file with real findings", () => {
	it("catches real insensitive language with the rule id and alex's own message", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("docs/guide.md")] },
			{ status: 200, body: contentsBody("He is a mankind hero.") },
		]);

		const result = await lintInclusiveLanguage({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.fileCount).toBe(1);
		expect(result.messages.length).toBeGreaterThan(0);
		expect(result.messages[0]).toMatchObject({ file: "docs/guide.md", ruleId: "he-she" });
		expect(result.messages.some((m) => m.ruleId === "mankind")).toBe(true);
		expect(result.messages.some((m) => m.ruleId === "hero-heroine")).toBe(true);
	});

	it("supports .mdx files via alex's own mdx() export", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("docs/guide.mdx")] },
			{ status: 200, body: contentsBody("He wrote this guide.") },
		]);

		const result = await lintInclusiveLanguage({ client, repo: "acme/demo", pullNumber: 7, ref: "sha" });

		expect(result.valid).toBe(false);
		expect(result.messages[0]?.file).toBe("docs/guide.mdx");
	});
});

describe("lintInclusiveLanguage — the org's canonical allow-list", () => {
	it("doesn't flag a term ALEX_CONFIG explicitly allows", async () => {
		const { client } = makeClient([
			{ status: 200, body: [file("README.md")] },
			{ status: 200, body: contentsBody("A pre-commit hook via husky handles a failure gracefully.") },
		]);

		const result = await lintInclusiveLanguage({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 1, messages: [] });
	});
});

describe("lintInclusiveLanguage — scoping", () => {
	it("skips non-markdown changed files entirely, without fetching their content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("src/index.ts")] }]);

		const result = await lintInclusiveLanguage({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips files matching .alexignore's patterns, without fetching their content", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("CHANGELOG.md"), file(".github/foo.md")] }]);

		const result = await lintInclusiveLanguage({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});

	it("skips a removed file even if it's markdown and not otherwise ignored", async () => {
		const { client, calls } = makeClient([{ status: 200, body: [file("docs/deleted.md", "removed")] }]);

		const result = await lintInclusiveLanguage({ client, repo: "acme/demo", pullNumber: 1, ref: "sha" });

		expect(result).toEqual({ valid: true, fileCount: 0, messages: [] });
		expect(calls).toHaveLength(1);
	});
});
