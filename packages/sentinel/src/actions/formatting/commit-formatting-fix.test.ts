import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { commitFormattingFix } from "./commit-formatting-fix.js";
import type { LintFormattingResult } from "./lint-formatting.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("commitFormattingFix — nothing to fix", () => {
	it("makes no API calls and reports committed: false when there are no messages", async () => {
		const { client, calls } = makeClient([]);
		const result: LintFormattingResult = { valid: true, fileCount: 3, messages: [] };

		const outcome = await commitFormattingFix({
			client,
			repo: "acme/demo",
			headSha: "sha1",
			headRef: "feature",
			result,
		});

		expect(outcome).toEqual({ committed: false, fileCount: 0 });
		expect(calls).toHaveLength(0);
	});
});

describe("commitFormattingFix — one file", () => {
	it("builds one blob, one tree off the head commit's tree, one commit, and moves the branch ref", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: { sha: "sha1", tree: { sha: "base-tree" } } },
			{ status: 200, body: { sha: "blob-sha", url: "" } },
			{ status: 200, body: { sha: "new-tree", tree: [], truncated: false } },
			{ status: 200, body: { sha: "new-commit", tree: { sha: "new-tree" } } },
			{ status: 200, body: { ref: "refs/heads/feature", object: { sha: "new-commit" } } },
		]);
		const result: LintFormattingResult = {
			valid: false,
			fileCount: 1,
			messages: [{ file: "src/index.js", line: 1, reason: "...", formatted: "const x = 1;\n" }],
		};

		const outcome = await commitFormattingFix({
			client,
			repo: "acme/demo",
			headSha: "sha1",
			headRef: "feature",
			result,
		});

		expect(calls[0]?.url).toContain("/git/commits/sha1");

		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toContain("/git/blobs");
		expect(calls[1]?.body).toMatchObject({ content: "const x = 1;\n", encoding: "utf-8" });

		expect(calls[2]?.url).toContain("/git/trees");
		expect(calls[2]?.body).toMatchObject({
			base_tree: "base-tree",
			tree: [{ path: "src/index.js", mode: "100644", type: "blob", sha: "blob-sha" }],
		});

		expect(calls[3]?.url).toContain("/git/commits");
		expect(calls[3]?.body).toMatchObject({ tree: "new-tree", parents: ["sha1"] });
		expect((calls[3]?.body as { message: string }).message).toContain("Signed-off-by: Holocron Sentinel");

		expect(calls[4]?.method).toBe("PATCH");
		expect(calls[4]?.url).toContain("/git/refs/heads/feature");
		expect(calls[4]?.body).toMatchObject({ sha: "new-commit" });

		expect(outcome).toEqual({ committed: true, commitSha: "new-commit", fileCount: 1 });
	});
});

describe("commitFormattingFix — multiple files", () => {
	it("commits every reformatted file atomically, in one tree/commit", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: { sha: "sha1", tree: { sha: "base-tree" } } },
			{ status: 200, body: { sha: "blob-a", url: "" } },
			{ status: 200, body: { sha: "blob-b", url: "" } },
			{ status: 200, body: { sha: "new-tree", tree: [], truncated: false } },
			{ status: 200, body: { sha: "new-commit", tree: { sha: "new-tree" } } },
			{ status: 200, body: { ref: "refs/heads/feature", object: { sha: "new-commit" } } },
		]);
		const result: LintFormattingResult = {
			valid: false,
			fileCount: 2,
			messages: [
				{ file: "a.js", line: 1, reason: "...", formatted: "const a = 1;\n" },
				{ file: "b.js", line: 1, reason: "...", formatted: "const b = 2;\n" },
			],
		};

		const outcome = await commitFormattingFix({
			client,
			repo: "acme/demo",
			headSha: "sha1",
			headRef: "feature",
			result,
		});

		const treeCall = calls.find((c) => c.url.includes("/git/trees"));
		expect((treeCall?.body as { tree: Array<{ path: string }> }).tree.map((t) => t.path)).toEqual(["a.js", "b.js"]);
		expect(outcome).toEqual({ committed: true, commitSha: "new-commit", fileCount: 2 });
	});
});
