import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { findUpward, hasGitEntry } from "./find-upward.ts";

describe("findUpward", () => {
	let root: string;
	let nested: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "fs-utils-"));
		nested = join(root, "a", "b");
		await mkdir(nested, { recursive: true });
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("returns the result from the starting directory when check matches immediately", async () => {
		const result = await findUpward(nested, (dir) => (dir === nested ? "found" : undefined));
		expect(result).toBe("found");
	});

	it("walks up through ancestors until check matches", async () => {
		const result = await findUpward(nested, (dir) => (dir === root ? "found-at-root" : undefined));
		expect(result).toBe("found-at-root");
	});

	it("stops walking once stop returns true, without a result", async () => {
		const stopDir = join(root, "a");
		const result = await findUpward(
			nested,
			(dir) => (dir === root ? "found-at-root" : undefined),
			(dir) => dir === stopDir
		);
		expect(result).toBeUndefined();
	});

	it("still checks the directory where stop becomes true, before stopping", async () => {
		const stopDir = join(root, "a");
		const result = await findUpward(
			nested,
			(dir) => (dir === stopDir ? "found-at-stop-dir" : undefined),
			(dir) => dir === stopDir
		);
		expect(result).toBe("found-at-stop-dir");
	});

	it("returns undefined once the filesystem root is reached with no match and no stop", async () => {
		const result = await findUpward(nested, () => undefined);
		expect(result).toBeUndefined();
	});
});

describe("hasGitEntry", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "fs-utils-git-"));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("is false when there is no .git entry", async () => {
		expect(await hasGitEntry(dir)).toBe(false);
	});

	it("is true for a .git directory", async () => {
		await mkdir(join(dir, ".git"));
		expect(await hasGitEntry(dir)).toBe(true);
	});

	it("is true for a .git file (worktree/submodule pointer)", async () => {
		await writeFile(join(dir, ".git"), "gitdir: /elsewhere\n");
		expect(await hasGitEntry(dir)).toBe(true);
	});
});
