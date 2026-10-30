import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader, type PullRequest } from "../../plugin/index.js";
import type { LocalBranch, LocalGit } from "./repo-cleanup-branches.type.js";
import { runCleanupBranches } from "./run-cleanup-branches.js";

const loaded: LoadedConfig = {
	resolved: resolveConfig({ name: "demo", providers: { source: "github" } }),
	filepath: "/tmp/test/holocron.config.json",
};

function loaderWith(source: Record<string, unknown> | undefined, config = loaded): PluginLoader {
	const importer = vi.fn(async () => ({
		createPlugin: () => ({ name: "github", capabilities: source ? { source: () => source } : {} }),
	}));
	return new PluginLoader(
		config.resolved,
		{ repoRoot: "/tmp/test", repo: "o/r" },
		importer as unknown as PluginImporter
	);
}

const branch = (name: string, sha: string, date = "2026-10-01T00:00:00+00:00"): LocalBranch => ({ name, sha, date });

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

function fakeGit(over: Partial<LocalGit> = {}): LocalGit & { deleted: string[] } {
	const deleted: string[] = [];
	return {
		deleted,
		branches: () => [
			branch("alpha", "a"),
			branch("work", "w"),
			branch("wt", "t"),
			branch("open", "o"),
			branch("anc", "anc"),
			branch("squash", "head-1"),
			branch("extra", "more"),
			branch("abandoned", "ab", "2026-10-05T00:00:00+00:00"),
			branch("stale", "s", "2026-09-01T00:00:00+00:00"),
			branch("fresh", "f", "2026-10-09T00:00:00+00:00"),
		],
		currentBranch: () => "work",
		worktreeBranches: () => ["wt"],
		isMergedIntoBase: (sha) => sha === "anc",
		isAncestor: () => false,
		deleteBranch: (name) => void deleted.push(name),
		...over,
	};
}

const PRS = {
	open: [pr(9, "open", { state: "open", merged: false })],
	closed: [pr(1, "squash"), pr(2, "extra"), pr(3, "abandoned", { merged: false })],
};

function makeSource(over: Record<string, unknown> = {}) {
	return {
		providerName: "github",
		key: "source" as const,
		listPullRequests: vi.fn(async (state: string) => (state === "open" ? PRS.open : PRS.closed)),
		listPullRequestCommits: vi.fn(async () => []),
		...over,
	};
}

function go(over: Partial<Parameters<typeof runCleanupBranches>[0]> = {}, source = makeSource(), git = fakeGit()) {
	const lines: string[] = [];
	const logger = fakeLogger();
	return {
		lines,
		git,
		source,
		run: () =>
			runCleanupBranches({
				loaded,
				context: { repoRoot: "/tmp/test" },
				git,
				loader: loaderWith(source),
				print: (l) => void lines.push(l),
				logger,
				...over,
			}),
	};
}

describe("runCleanupBranches", () => {
	it("throws when no source provider is configured", async () => {
		const bare: LoadedConfig = { resolved: resolveConfig({ name: "demo", providers: {} }), filepath: "/x" };
		await expect(
			runCleanupBranches({
				loaded: bare,
				context: { repoRoot: "/tmp/test" },
				git: fakeGit(),
				loader: loaderWith(undefined, bare),
				print: () => {},
			})
		).rejects.toThrow(/source capability is not configured/);
	});

	it("throws when the source provider cannot list pull requests", async () => {
		const t = go({}, makeSource({ listPullRequests: undefined }));
		await expect(t.run()).rejects.toThrow(/does not support listing pull requests/);
	});

	it("lists the groups and deletes nothing without --yes", async () => {
		const t = go();
		const report = await t.run();
		expect(t.git.deleted).toEqual([]);
		expect(report.deleted).toEqual([]);
		expect(report.status).toBe("ok");
		const out = t.lines.join("\n");
		expect(out).toContain("1  merged");
		expect(out).toContain("1  squash-merged");
		expect(out).toContain("Dry run: would delete 2 branches");
		expect(out).toMatch(/extra {2}.*PR #2/);
	});

	it("lists the branches left alone newest first, and says why each skipped one was skipped", async () => {
		const t = go();
		await t.run();
		const out = t.lines.join("\n");
		expect(out.indexOf("fresh")).toBeLessThan(out.indexOf("stale"));
		expect(out).toContain("4  skipped");
		for (const reason of ["base branch", "checked out", "checked out in a worktree", "has an open PR"]) {
			expect(out).toContain(reason);
		}
	});

	it("leaves a branch with no skipped branches without a skipped line", async () => {
		const git = fakeGit({
			branches: () => [branch("anc", "anc")],
			currentBranch: () => undefined,
			worktreeBranches: () => [],
		});
		const t = go({}, makeSource({ listPullRequests: vi.fn(async () => []) }), git);
		await t.run();
		expect(t.lines.join("\n")).not.toContain("skipped");
	});

	it("deletes only the proven-merged branches with --yes", async () => {
		const t = go({ yes: true });
		const report = await t.run();
		expect(t.git.deleted.sort()).toEqual(["anc", "squash"]);
		expect(report.deleted.sort()).toEqual(["anc", "squash"]);
		expect(t.lines.join("\n")).toContain("Deleted 2 of 2 branches.");
	});

	it("still deletes nothing on --dry-run, even with --yes", async () => {
		const t = go({ yes: true, context: { repoRoot: "/tmp/test", dryRun: true } });
		await t.run();
		expect(t.git.deleted).toEqual([]);
	});

	it("reports a branch git refused to delete and fails the run, but keeps going", async () => {
		const git = fakeGit({
			deleteBranch: (name) => {
				if (name === "anc") throw new Error("not fully merged");
			},
		});
		const t = go({ yes: true }, makeSource(), git);
		const report = await t.run();
		expect(report.status).toBe("fail");
		expect(report.failed).toEqual([{ name: "anc", message: "not fully merged" }]);
		expect(report.deleted).toEqual(["squash"]);
		expect(t.lines.join("\n")).toContain("anc: not fully merged");
	});

	it("passes the repo override to the provider", async () => {
		const t = go({ repo: "o/other" });
		await t.run();
		expect(t.source.listPullRequests).toHaveBeenCalledWith("open", "o/other");
		expect(t.source.listPullRequests).toHaveBeenCalledWith("closed", "o/other");
	});

	it("looks a PR's commits up through the provider for a tip its head does not explain", async () => {
		const source = makeSource({ listPullRequestCommits: vi.fn(async (n: number) => (n === 2 ? ["more"] : [])) });
		const t = go({ yes: true }, source);
		await t.run();
		expect(source.listPullRequestCommits).toHaveBeenCalledWith(2, undefined);
		expect(t.git.deleted.sort()).toEqual(["anc", "extra", "squash"]);
	});
});
