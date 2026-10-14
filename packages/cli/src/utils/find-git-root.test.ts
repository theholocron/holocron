import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findGitRoot } from "./find-git-root.js";

describe("findGitRoot", () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "holocron-gitroot-"));
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("returns the start dir itself when it's the git root", async () => {
		await mkdir(join(root, ".git"));
		expect(findGitRoot(root)).toBe(root);
	});

	it("walks up through a monorepo subpackage to find the real git root", async () => {
		await mkdir(join(root, ".git"));
		const subpackage = join(root, "packages", "sentinel");
		await mkdir(subpackage, { recursive: true });
		expect(findGitRoot(subpackage)).toBe(root);
	});

	it("walks up through several levels of nesting", async () => {
		await mkdir(join(root, ".git"));
		const deep = join(root, "a", "b", "c", "d");
		await mkdir(deep, { recursive: true });
		expect(findGitRoot(deep)).toBe(root);
	});

	it("treats a worktree's .git FILE (not a directory) as the root too", async () => {
		// A real worktree/submodule .git is a file containing a `gitdir:`
		// pointer — findGitRoot only checks presence, never follows it.
		await writeFile(join(root, ".git"), "gitdir: /elsewhere/.git/worktrees/x\n");
		const subpackage = join(root, "packages", "sentinel");
		await mkdir(subpackage, { recursive: true });
		expect(findGitRoot(subpackage)).toBe(root);
	});

	it("falls back to the start dir when no .git is found anywhere above it", async () => {
		// No .git created anywhere under `root` — root itself has none,
		// and mkdtemp's parent (the real OS tmp dir) has none either in
		// any sane environment, so this exercises the climb-to-fs-root path.
		const nested = join(root, "no-git-here");
		await mkdir(nested);
		expect(findGitRoot(nested)).toBe(nested);
	});
});
