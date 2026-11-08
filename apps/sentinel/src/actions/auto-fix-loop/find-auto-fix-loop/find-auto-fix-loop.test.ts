import type { GitHubClient, GitHubPullRequestCommit } from "@theholocron/github-client";
import { describe, expect, it, vi } from "vitest";

import { AUTO_FIX_SUBJECTS } from "../auto-fix-subjects/index.js";
import { findAutoFixLoop } from "./find-auto-fix-loop.js";

const commit = (message: string): GitHubPullRequestCommit => ({
	sha: "abc",
	commit: {
		message,
		author: { name: "n", email: "n@x" },
		committer: { name: "n", email: "n@x" },
	},
	author: null,
	parents: [{ sha: "p" }],
});

function clientWith(messages: string[]) {
	const listCommits = vi.fn(async () => messages.map(commit));
	return { client: { pulls: { listCommits } } as unknown as Pick<GitHubClient, "pulls">, listCommits };
}

describe("findAutoFixLoop", () => {
	it("reads the pull request's commits and names the kinds that already committed", async () => {
		const { client, listCommits } = clientWith([
			"feat: a",
			AUTO_FIX_SUBJECTS.formatting,
			AUTO_FIX_SUBJECTS.editorconfig,
		]);
		const result = await findAutoFixLoop({ client, repo: "acme/demo", pullNumber: 7 });
		expect(listCommits).toHaveBeenCalledWith("acme/demo", 7);
		expect(result).toEqual({ blocked: ["formatting", "editorconfig"] });
	});

	it("blocks nothing when the last commit is a person's", async () => {
		const { client } = clientWith([AUTO_FIX_SUBJECTS.formatting, "fix: b"]);
		expect(await findAutoFixLoop({ client, repo: "acme/demo", pullNumber: 7 })).toEqual({ blocked: [] });
	});

	it("lets an API failure through for the caller to soft-skip", async () => {
		const client = {
			pulls: {
				listCommits: vi.fn(async () => {
					throw new Error("boom");
				}),
			},
		} as unknown as Pick<GitHubClient, "pulls">;
		await expect(findAutoFixLoop({ client, repo: "acme/demo", pullNumber: 7 })).rejects.toThrow("boom");
	});
});
