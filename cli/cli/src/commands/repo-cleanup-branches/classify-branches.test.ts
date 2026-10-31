import { describe, expect, it, vi } from "vitest";

import type { PullRequest } from "../../plugin/index.js";
import { classifyBranches } from "./classify-branches.js";
import type { BranchLocation, BranchRef, ClassifyBranchesInput } from "./repo-cleanup-branches.type.js";

const branch = (name: string, sha = `sha-${name}`, where: BranchLocation = "local"): BranchRef => ({
	name,
	sha,
	where,
});

const pr = (number: number, name: string, over: Partial<PullRequest> = {}): PullRequest => ({
	number,
	title: `PR ${number}`,
	state: "closed",
	merged: true,
	branch: name,
	headSha: `head-${number}`,
	url: `https://example.test/pull/${number}`,
	...over,
});

function run(branches: BranchRef[], over: Partial<ClassifyBranchesInput> = {}) {
	return classifyBranches({
		branches,
		git: { isMergedIntoBase: () => false, isAncestor: () => false },
		excluded: () => undefined,
		openPullRequests: [],
		closedPullRequests: [],
		pullRequestCommits: async () => [],
		...over,
	});
}

const groupOf = async (b: BranchRef, over: Partial<ClassifyBranchesInput> = {}) => (await run([b], over)).classified[0];

describe("classifyBranches", () => {
	it("skips an excluded branch with the reason it was excluded", async () => {
		const result = await run([branch("alpha"), branch("work"), branch("wt")], {
			excluded: (ref) => ({ alpha: "base", work: "current", wt: "worktree" })[ref.name] as never,
		});
		expect(result.skipped.map((s) => [s.ref.name, s.reason])).toEqual([
			["alpha", "base"],
			["work", "current"],
			["wt", "worktree"],
		]);
		expect(result.classified).toEqual([]);
	});

	it("skips a branch with an open PR even when it also has a merged one", async () => {
		const result = await run([branch("x")], {
			openPullRequests: [pr(2, "x", { state: "open", merged: false })],
			closedPullRequests: [pr(1, "x")],
		});
		expect(result.skipped).toEqual([{ ref: branch("x"), reason: "open-pr" }]);
	});

	it("calls an ancestor of a base branch merged, without asking the provider anything", async () => {
		const commits = vi.fn(async () => []);
		const got = await groupOf(branch("x"), {
			git: { isMergedIntoBase: () => true, isAncestor: () => false },
			pullRequestCommits: commits,
		});
		expect(got?.group).toBe("merged");
		expect(commits).not.toHaveBeenCalled();
	});

	it("calls a tip equal to a merged PR's head squash-merged", async () => {
		const commits = vi.fn(async () => []);
		const got = await groupOf(branch("x", "head-1"), {
			closedPullRequests: [pr(1, "x")],
			pullRequestCommits: commits,
		});
		expect(got).toMatchObject({ group: "squash-merged", pr: 1 });
		expect(commits).not.toHaveBeenCalled();
	});

	it("calls a tip that is an ancestor of the PR's head squash-merged", async () => {
		const got = await groupOf(branch("x"), {
			closedPullRequests: [pr(1, "x")],
			git: { isMergedIntoBase: () => false, isAncestor: (sha, of) => sha === "sha-x" && of === "head-1" },
		});
		expect(got).toMatchObject({ group: "squash-merged", pr: 1 });
	});

	it("falls back to the PR's commits when the head commit is not in the checkout", async () => {
		const got = await groupOf(branch("x", "mid"), {
			closedPullRequests: [pr(1, "x")],
			pullRequestCommits: async (n) => (n === 1 ? ["early", "mid", "head-1"] : []),
		});
		expect(got).toMatchObject({ group: "squash-merged", pr: 1 });
	});

	it("asks for the commits of a PR whose head sha the provider did not give", async () => {
		const noSha = pr(1, "x");
		delete noSha.headSha;
		const got = await groupOf(branch("x", "mid"), {
			closedPullRequests: [noSha],
			pullRequestCommits: async () => ["mid"],
		});
		expect(got).toMatchObject({ group: "squash-merged", pr: 1 });
	});

	it("matches against an older merged PR when the newest one does not account for the tip", async () => {
		const got = await groupOf(branch("x", "head-1"), { closedPullRequests: [pr(2, "x"), pr(1, "x")] });
		expect(got).toMatchObject({ group: "squash-merged", pr: 1 });
	});

	it("lists a branch with commits beyond its merged PR as has-extra, naming the newest PR", async () => {
		const got = await groupOf(branch("x", "newer"), { closedPullRequests: [pr(2, "x"), pr(1, "x")] });
		expect(got).toMatchObject({ group: "has-extra", pr: 2 });
	});

	it("lists a branch whose PR closed unmerged as closed-unmerged", async () => {
		const got = await groupOf(branch("x"), { closedPullRequests: [pr(1, "x", { merged: false })] });
		expect(got?.group).toBe("closed-unmerged");
	});

	it("lists a branch with no PR and no merge as no-pr", async () => {
		expect((await groupOf(branch("x")))?.group).toBe("no-pr");
	});

	it("does not match a PR from a different branch name", async () => {
		const got = await groupOf(branch("x", "head-1"), { closedPullRequests: [pr(1, "other")] });
		expect(got?.group).toBe("no-pr");
	});

	it("classifies a remote ref by the same evidence as a local one", async () => {
		const got = await groupOf(branch("x", "head-1", "remote"), { closedPullRequests: [pr(1, "x")] });
		expect(got).toMatchObject({ group: "squash-merged", ref: { where: "remote" } });
	});

	it("lets the exclusion depend on where the branch is", async () => {
		const result = await run([branch("x", "s1", "local"), branch("x", "s2", "remote")], {
			excluded: (ref) => (ref.where === "local" ? "current" : undefined),
		});
		expect(result.skipped.map((s) => s.ref.where)).toEqual(["local"]);
		expect(result.classified.map((c) => c.ref.where)).toEqual(["remote"]);
	});
});
