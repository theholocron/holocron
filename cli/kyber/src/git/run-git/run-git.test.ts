import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runGit } from "./run-git.js";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe("runGit", () => {
	it("returns trimmed stdout, run in the directory it is given", () => {
		const dir = mkdtempSync(join(tmpdir(), "run-git-"));
		dirs.push(dir);
		runGit(["init", "-q"], dir);
		expect(runGit(["rev-parse", "--is-inside-work-tree"], dir)).toBe("true");
	});

	it("throws when git fails", () => {
		const dir = mkdtempSync(join(tmpdir(), "run-git-"));
		dirs.push(dir);
		expect(() => runGit(["rev-parse", "--verify", "refs/tags/none"], dir)).toThrow();
	});
});
