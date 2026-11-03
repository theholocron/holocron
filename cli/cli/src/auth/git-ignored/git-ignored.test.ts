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
	it("is `ignored` for a path a rule ignores", () => {
		expect(isGitIgnored(join(repo(), ".credentials"))).toBe("ignored");
	});

	it("is `tracked` for a path git would track", () => {
		expect(isGitIgnored(join(repo(), "notes.txt"))).toBe("tracked");
	});

	it("is `no-repo` outside a git repository", () => {
		expect(isGitIgnored(join(mkdtempSync(join(tmpdir(), "holocron-nogit-")), ".credentials"))).toBe("no-repo");
	});

	it("is `no-repo` when git cannot be run in the directory (no directory, or git not installed)", () => {
		expect(isGitIgnored(join(tmpdir(), "holocron-no-such-dir", ".credentials"))).toBe("no-repo");
	});

	it("is `unknown`, not `no-repo`, when git fails for any other reason", () => {
		// A pathspec git cannot parse, from inside a repository: git exits 128 with a message that is not "not a git repository".
		const cwd = process.cwd();
		process.chdir(repo());
		try {
			expect(isGitIgnored(":(bogus)x")).toBe("unknown");
		} finally {
			process.chdir(cwd);
		}
	});
});
