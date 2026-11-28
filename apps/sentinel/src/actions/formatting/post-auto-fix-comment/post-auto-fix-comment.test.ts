import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { postAutoFixComment } from "./post-auto-fix-comment.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("postAutoFixComment — a fix was committed", () => {
	it("posts a comment naming every reformatted file and the commit sha", async () => {
		const { client, calls } = makeClient([{ status: 201, body: {} }]);

		const result = await postAutoFixComment({
			client,
			repo: "acme/demo",
			pullNumber: 9,
			fixResult: { committed: true, commitSha: "abc1234", fileCount: 2 },
			lintResult: {
				valid: false,
				fileCount: 2,
				messages: [
					{ file: "src/index.js", line: 1, reason: "...", formatted: "x", scopedFix: "x" },
					{ file: "README.md", line: 1, reason: "...", formatted: "y", scopedFix: "y" },
				],
			},
		});

		expect(result).toEqual({ posted: true });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toContain("/issues/9/comments");
		const body = (calls[0]?.body as { body: string }).body;
		expect(body).toContain("Sentinel auto-formatted 2 file(s)");
		expect(body).toContain("`src/index.js`");
		expect(body).toContain("`README.md`");
		expect(body).toContain("abc1234");
	});
});

describe("postAutoFixComment — a file with no fix on a line the pull request added (holocron#1950)", () => {
	it("names only the files the commit wrote, and counts only those", async () => {
		const { client, calls } = makeClient([{ status: 201, body: {} }]);

		await postAutoFixComment({
			client,
			repo: "acme/demo",
			pullNumber: 9,
			fixResult: { committed: true, commitSha: "abc1234", fileCount: 1 },
			lintResult: {
				valid: false,
				fileCount: 2,
				messages: [
					{ file: "src/index.js", line: 1, reason: "...", formatted: "x", scopedFix: "x" },
					{ file: "README.md", line: 1, reason: "...", formatted: "y", scopedFix: null },
				],
			},
		});

		const body = (calls[0]?.body as { body: string }).body;
		expect(body).toContain("Sentinel auto-formatted 1 file(s)");
		expect(body).toContain("`src/index.js`");
		expect(body).not.toContain("README.md");
	});
});

describe("postAutoFixComment — nothing was committed", () => {
	it("makes no API call and reports posted: false", async () => {
		const { client, calls } = makeClient([]);

		const result = await postAutoFixComment({
			client,
			repo: "acme/demo",
			pullNumber: 9,
			fixResult: { committed: false, fileCount: 0 },
			lintResult: { valid: true, fileCount: 3, messages: [] },
		});

		expect(result).toEqual({ posted: false });
		expect(calls).toHaveLength(0);
	});
});
