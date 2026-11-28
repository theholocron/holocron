import type { GitHubClient } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { readPullRequest } from "./read-pull-request.js";

describe("readPullRequest with the process cache and the real clock", () => {
	it("keeps an open pull request between calls without an injected cache or time", async () => {
		const open = { number: 31, state: "open", head: { sha: "abc", ref: "feat/x" }, base: { ref: "alpha" } };
		const getPullRequest = vi.fn(async () => open);
		const client = { pulls: { getPullRequest } } as unknown as GitHubClient;
		const first = await readPullRequest({ client, repo: "acme/default-cache", number: 31, sha: "abc" });
		const second = await readPullRequest({ client, repo: "acme/default-cache", number: 31, sha: "abc" });
		expect(second).toBe(first);
		expect(getPullRequest).toHaveBeenCalledTimes(1);
	});
});
