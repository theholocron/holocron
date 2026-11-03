import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isGitIgnored } from "./git-ignored.js";

const repo = () => {
	const dir = mkdtempSync(join(tmpdir(), "holocron-gitignored-"));
	execFileSync("git", ["init", "-q"], { cwd: dir });
	writeFileSync(join(dir, ".gitignore"), ".credentials\n");
	return dir;
};

describe("isGitIgnored", () => {
	it("is true for a path a rule ignores", () => {
		expect(isGitIgnored(join(repo(), ".credentials"))).toBe(true);
	});

	it("is false for a path git would track", () => {
		expect(isGitIgnored(join(repo(), "notes.txt"))).toBe(false);
	});

	it("is null outside a git repository", () => {
		expect(isGitIgnored(join(mkdtempSync(join(tmpdir(), "holocron-nogit-")), ".credentials"))).toBeNull();
	});
});
