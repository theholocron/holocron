import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { AUTO_FIX_LOOP_MARKER, postAutoFixLoopComment } from "./post-auto-fix-loop-comment.js";

function clientWith(existing: string[]) {
	const createComment = vi.fn(async (..._args: unknown[]): Promise<void> => undefined);
	const listComments = vi.fn(async () => existing.map((body) => ({ body, created_at: "", user: null })));
	return {
		client: { issues: { createComment, listComments } } as unknown as Pick<GitHubClient, "issues">,
		createComment,
	};
}

const input = {
	repo: "acme/demo",
	pullNumber: 7,
	kinds: ["formatting", "markdown-lint"] as ("formatting" | "markdown-lint")[],
	files: ["docs/probe.mdx"],
};

describe("postAutoFixLoopComment", () => {
	it("explains the loop once, naming the fixers and the files", async () => {
		const { client, createComment } = clientWith(["an unrelated comment"]);
		const result = await postAutoFixLoopComment({ client, ...input });
		expect(result).toEqual({ posted: true });
		const body = createComment.mock.calls[0]![2] as string;
		expect(createComment.mock.calls[0]!.slice(0, 2)).toEqual(["acme/demo", 7]);
		expect(body).toContain("prettier and markdownlint");
		expect(body).toContain("- `docs/probe.mdx`");
		expect(body.endsWith(AUTO_FIX_LOOP_MARKER)).toBe(true);
	});

	it("posts nothing when the pull request already has it", async () => {
		const { client, createComment } = clientWith([`earlier\n${AUTO_FIX_LOOP_MARKER}`]);
		expect(await postAutoFixLoopComment({ client, ...input })).toEqual({ posted: false });
		expect(createComment).not.toHaveBeenCalled();
	});
});
