import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalGit } from "./local-git.js";

let dir: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();

beforeEach(() => {
	dir = realpathSync(mkdtempSync(join(tmpdir(), "local-git-")));
	git("init", "-q", "-b", "alpha");
	git("config", "user.email", "t@example.test");
	git("config", "user.name", "T");
	git("config", "commit.gpgsign", "false");
	writeFileSync(join(dir, "a.txt"), "a");
	git("add", ".");
	git("commit", "-q", "-m", "first");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("createLocalGit", () => {
	it("lists local branches with their sha and commit date", () => {
		git("branch", "feature");
		const branches = createLocalGit(dir).branches();
		expect(branches.map((b) => b.name).sort()).toEqual(["alpha", "feature"]);
		expect(branches[0]?.sha).toMatch(/^[0-9a-f]{40}$/);
		expect(branches[0]?.where).toBe("local");
		expect(branches[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("reports the checked-out branch, and none when HEAD is detached", () => {
		expect(createLocalGit(dir).currentBranch()).toBe("alpha");
		git("checkout", "-q", "--detach");
		expect(createLocalGit(dir).currentBranch()).toBeUndefined();
	});

	it("lists the branches every worktree has out", () => {
		git("branch", "feature");
		const wt = join(dir, "wt");
		mkdirSync(wt);
		git("worktree", "add", "-q", wt, "feature");
		expect(createLocalGit(dir).worktreeBranches().sort()).toEqual(["alpha", "feature"]);
	});

	it("tells a commit merged into origin/<base> from one that is not", () => {
		const sha = git("rev-parse", "HEAD");
		git("update-ref", "refs/remotes/origin/alpha", sha);
		writeFileSync(join(dir, "b.txt"), "b");
		git("add", ".");
		git("commit", "-q", "-m", "second");
		const g = createLocalGit(dir);
		expect(g.isMergedIntoBase(sha)).toBe(true);
		expect(g.isMergedIntoBase(git("rev-parse", "HEAD"))).toBe(false);
	});

	it("answers isAncestor, and false for a commit that is not in the checkout", () => {
		const first = git("rev-parse", "HEAD");
		writeFileSync(join(dir, "b.txt"), "b");
		git("add", ".");
		git("commit", "-q", "-m", "second");
		const second = git("rev-parse", "HEAD");
		const g = createLocalGit(dir);
		expect(g.isAncestor(first, second)).toBe(true);
		expect(g.isAncestor(second, first)).toBe(false);
		expect(g.isAncestor("0".repeat(40), second)).toBe(false);
	});

	it("deletes a branch that is not merged, and throws git's message for one that does not exist", () => {
		git("checkout", "-q", "-b", "wip");
		writeFileSync(join(dir, "c.txt"), "c");
		git("add", ".");
		git("commit", "-q", "-m", "wip");
		git("checkout", "-q", "alpha");
		const g = createLocalGit(dir);
		g.deleteBranch("wip");
		expect(g.branches().map((b) => b.name)).toEqual(["alpha"]);
		expect(() => g.deleteBranch("wip")).toThrow(/wip/);
	});

	it("throws a generic message when git gives none", () => {
		expect(() => createLocalGit(join(dir, "missing")).deleteBranch("x")).toThrow();
	});
});
