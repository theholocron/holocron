import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkbox, confirm } from "@inquirer/prompts";
import { fakeLogger } from "@theholocron/observability/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type LoadedConfig, resolveConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader, type PullRequest } from "../../plugin/index.js";
import { NonInteractiveError } from "../../ui/index.js";
import type { BranchRef, LocalGit } from "./repo-cleanup-branches.type.js";
import { runCleanupBranches } from "./run-cleanup-branches.js";

vi.mock("@inquirer/prompts", async (importActual) => ({
	...(await importActual<typeof import("@inquirer/prompts")>()),
	checkbox: vi.fn(),
	confirm: vi.fn(),
}));
const mockCheckbox = vi.mocked(checkbox);
const mockConfirm = vi.mocked(confirm);

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

const local = (name: string, sha: string, date = "2026-10-01T00:00:00+00:00"): BranchRef => ({
	name,
	sha,
	date,
	where: "local",
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

function fakeGit(over: Partial<LocalGit> = {}): LocalGit & { deleted: string[] } {
	const deleted: string[] = [];
	return {
		deleted,
		branches: () => [
			local("alpha", "a"),
			local("work", "w"),
			local("wt", "t"),
			local("open", "o"),
			local("anc", "anc"),
			local("squash", "head-1"),
			local("extra", "more"),
			local("abandoned", "ab", "2026-10-05T00:00:00+00:00"),
			local("stale", "s", "2026-09-01T00:00:00+00:00"),
			local("fresh", "f", "2026-10-09T00:00:00+00:00"),
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
		listBranches: vi.fn(async () => [
			{ name: "alpha", sha: "a" },
			{ name: "squash", sha: "head-1" },
			{ name: "remote-only", sha: "r" },
		]),
		deleteBranch: vi.fn(async () => {}),
		...over,
	};
}

function go(over: Partial<Parameters<typeof runCleanupBranches>[0]> = {}, source = makeSource(), git = fakeGit()) {
	const lines: string[] = [];
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
				logger: fakeLogger(),
				...over,
			}),
	};
}

const tty = (value: boolean) => Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });

describe("runCleanupBranches", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tty(true);
	});
	afterEach(() => tty(false));

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
		await expect(go({}, makeSource({ listPullRequests: undefined })).run()).rejects.toThrow(
			/listing pull requests/
		);
	});

	it("throws when remote branches are in scope and the provider cannot list or delete them", async () => {
		await expect(go({}, makeSource({ deleteBranch: undefined })).run()).rejects.toThrow(/remote branches/);
		await expect(go({ scope: "remote" }, makeSource({ listBranches: undefined })).run()).rejects.toThrow(
			/remote branches/
		);
	});

	it("needs neither remote method for a local-only run", async () => {
		const t = go(
			{ scope: "local", context: { repoRoot: "/tmp/test", dryRun: true } },
			makeSource({ listBranches: undefined, deleteBranch: undefined })
		);
		await expect(t.run()).resolves.toBeDefined();
	});

	it("reads this checkout with git and prints to the console when it is given neither", async () => {
		const dir = realpathSync(mkdtempSync(join(tmpdir(), "cleanup-branches-")));
		try {
			execFileSync("git", ["init", "-q", "-b", "alpha", "--template="], { cwd: dir });
			const log = vi.spyOn(console, "log").mockImplementation(() => {});
			const source = makeSource({ listPullRequests: vi.fn(async () => []) });
			await runCleanupBranches({
				loaded,
				context: { repoRoot: dir, dryRun: true },
				scope: "local",
				loader: loaderWith(source),
				logger: fakeLogger(),
			});
			expect(log).toHaveBeenCalledWith(expect.stringContaining("Dry run"));
			log.mockRestore();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	describe("the list", () => {
		it("groups every branch, local and remote, and says where each one lives", async () => {
			const t = go({ context: { repoRoot: "/tmp/test", dryRun: true } });
			await t.run();
			const out = t.lines.join("\n");
			expect(out).toContain("1  merged");
			expect(out).toContain("1  squash-merged");
			expect(out).toMatch(/anc {2}\[local\]/);
			expect(out).toMatch(/squash {2}\[local, remote\]/);
			expect(out).toMatch(/remote-only {2}\[remote\]/);
			expect(out).toMatch(/extra {2}\[local\].*PR #2/);
		});

		it("lists a group newest first and says why each skipped branch was skipped", async () => {
			const t = go({ context: { repoRoot: "/tmp/test", dryRun: true } });
			await t.run();
			const out = t.lines.join("\n");
			expect(out.indexOf("fresh")).toBeLessThan(out.indexOf("stale"));
			expect(out).toContain("skipped");
			for (const reason of ["base branch", "checked out", "checked out in a worktree", "has an open PR"]) {
				expect(out).toContain(reason);
			}
		});

		it("does not exclude a remote branch for being checked out locally", async () => {
			const source = makeSource({ listBranches: vi.fn(async () => [{ name: "work", sha: "w" }]) });
			const t = go({ scope: "remote", context: { repoRoot: "/tmp/test", dryRun: true } }, source);
			const report = await t.run();
			expect(report.classification.classified.map((c) => c.ref.name)).toEqual(["work"]);
		});

		it("prints no skipped line when nothing is skipped", async () => {
			const git = fakeGit({
				branches: () => [local("anc", "anc")],
				currentBranch: () => undefined,
				worktreeBranches: () => [],
			});
			const source = makeSource({ listPullRequests: vi.fn(async () => []), listBranches: vi.fn(async () => []) });
			const t = go({ context: { repoRoot: "/tmp/test", dryRun: true } }, source, git);
			await t.run();
			expect(t.lines.join("\n")).not.toContain("skipped");
		});
	});

	describe("scope", () => {
		it("--local never asks the remote for branches", async () => {
			const t = go({ scope: "local", context: { repoRoot: "/tmp/test", dryRun: true } });
			await t.run();
			expect(t.source.listBranches).not.toHaveBeenCalled();
			expect(t.lines.join("\n")).not.toContain("remote-only");
		});

		it("--remote never reads the local branches, worktrees or checkout", async () => {
			const branches = vi.fn(() => []);
			const worktrees = vi.fn(() => []);
			const current = vi.fn(() => undefined);
			const t = go(
				{ scope: "remote", context: { repoRoot: "/tmp/test", dryRun: true } },
				makeSource(),
				fakeGit({ branches, worktreeBranches: worktrees, currentBranch: current })
			);
			await t.run();
			expect(branches).not.toHaveBeenCalled();
			expect(worktrees).not.toHaveBeenCalled();
			expect(current).not.toHaveBeenCalled();
			expect(t.lines.join("\n")).toContain("remote-only");
		});
	});

	describe("--dry-run", () => {
		it("lists and deletes nothing, even with --yes", async () => {
			const t = go({ yes: true, context: { repoRoot: "/tmp/test", dryRun: true } });
			const report = await t.run();
			expect(t.git.deleted).toEqual([]);
			expect(t.source.deleteBranch).not.toHaveBeenCalled();
			expect(report.deleted).toEqual([]);
			expect(mockConfirm).not.toHaveBeenCalled();
			expect(t.lines.join("\n")).toContain("Dry run: 2 branches are proven merged");
		});
	});

	describe("--yes", () => {
		it("deletes every proven-merged branch in both places without asking", async () => {
			const t = go({ yes: true });
			const report = await t.run();
			expect(mockConfirm).not.toHaveBeenCalled();
			expect(t.git.deleted.sort()).toEqual(["anc", "squash"]);
			expect(t.source.deleteBranch).toHaveBeenCalledWith("squash", undefined);
			expect(report.deleted).toHaveLength(3);
			expect(t.lines.join("\n")).toContain("Deleted 3 of 3 branches.");
		});

		it("reports what could not be deleted, fails the run, and keeps going", async () => {
			const git = fakeGit({
				deleteBranch: (name) => {
					if (name === "anc") throw new Error("not fully merged");
				},
			});
			const source = makeSource({ deleteBranch: vi.fn(async () => Promise.reject(new Error("403"))) });
			const t = go({ yes: true }, source, git);
			const report = await t.run();
			expect(report.status).toBe("fail");
			expect(report.failed).toEqual([
				{ name: "anc", where: "local", message: "not fully merged" },
				{ name: "squash", where: "remote", message: "403" },
			]);
			expect(report.deleted).toEqual([{ name: "squash", where: "local" }]);
			expect(t.lines.join("\n")).toContain("anc [local]: not fully merged");
		});

		it("does nothing when there is nothing to classify", async () => {
			const git = fakeGit({ branches: () => [] });
			const source = makeSource({ listBranches: vi.fn(async () => []) });
			const t = go({ yes: true, scope: "local" }, source, git);
			const report = await t.run();
			expect(report.deleted).toEqual([]);
		});
	});

	describe("the checklist", () => {
		it("refuses without a terminal and says how to run it", async () => {
			tty(false);
			const err = await go()
				.run()
				.catch((e: unknown) => e);
			expect(err).toBeInstanceOf(NonInteractiveError);
			expect((err as Error).message).toMatch(/--yes/);
		});

		it("deletes nothing when you decline to choose", async () => {
			mockConfirm.mockResolvedValue(false);
			const t = go();
			const report = await t.run();
			expect(mockCheckbox).not.toHaveBeenCalled();
			expect(t.git.deleted).toEqual([]);
			expect(report.deleted).toEqual([]);
		});

		it("offers every classified branch by group with only the proven-merged ones ticked", async () => {
			mockConfirm.mockResolvedValue(true);
			mockCheckbox.mockResolvedValue([]);
			await go().run();
			const choices = (
				mockCheckbox.mock.calls[0]?.[0] as unknown as {
					choices: Array<{ name?: string; checked?: boolean; separator?: string }>;
				}
			).choices;
			const rows = choices.filter((c) => c.name !== undefined);
			expect(rows.filter((c) => c.checked).map((c) => c.name)).toEqual([
				expect.stringContaining("anc"),
				expect.stringContaining("squash"),
			]);
			expect(rows.filter((c) => !c.checked)).toHaveLength(rows.length - 2);
			expect(choices.filter((c) => c.name === undefined).length).toBe(5);
		});

		it("leaves a group with no branches out of the checklist", async () => {
			mockConfirm.mockResolvedValue(true);
			mockCheckbox.mockResolvedValue([]);
			const git = fakeGit({
				branches: () => [local("anc", "anc")],
				currentBranch: () => undefined,
				worktreeBranches: () => [],
			});
			await go({ scope: "local" }, makeSource({ listPullRequests: vi.fn(async () => []) }), git).run();
			const choices = (mockCheckbox.mock.calls[0]?.[0] as unknown as { choices: unknown[] }).choices;
			expect(choices).toHaveLength(2);
		});

		it("deletes the picked rows in each place they live and only those", async () => {
			mockConfirm.mockResolvedValue(true);
			mockCheckbox.mockImplementation(async (config) => {
				const rows = (config as unknown as { choices: Array<{ name?: string; value: number }> }).choices.filter(
					(c) => c.name !== undefined
				);
				return rows.filter((r) => /squash|fresh|remote-only/.test(r.name!)).map((r) => r.value);
			});
			const t = go();
			const report = await t.run();
			expect(t.git.deleted.sort()).toEqual(["fresh", "squash"]);
			expect(t.source.deleteBranch).toHaveBeenCalledWith("squash", undefined);
			expect(t.source.deleteBranch).toHaveBeenCalledWith("remote-only", undefined);
			expect(report.deleted).toHaveLength(4);
		});

		it("passes the repo override to every provider call, including the delete", async () => {
			mockConfirm.mockResolvedValue(true);
			mockCheckbox.mockImplementation(async (config) =>
				(config as unknown as { choices: Array<{ name?: string; value: number }> }).choices
					.filter((c) => c.name?.includes("remote-only"))
					.map((c) => c.value)
			);
			const t = go({ repo: "o/other" });
			await t.run();
			expect(t.source.listPullRequests).toHaveBeenCalledWith("open", "o/other");
			expect(t.source.listBranches).toHaveBeenCalledWith("o/other");
			expect(t.source.deleteBranch).toHaveBeenCalledWith("remote-only", "o/other");
		});

		it("looks a PR's commits up through the provider for a tip its head does not explain", async () => {
			const source = makeSource({
				listPullRequestCommits: vi.fn(async (n: number) => (n === 2 ? ["more"] : [])),
			});
			const t = go({ yes: true }, source);
			await t.run();
			expect(source.listPullRequestCommits).toHaveBeenCalledWith(2, undefined);
			expect(t.git.deleted.sort()).toEqual(["anc", "extra", "squash"]);
		});
	});
});
