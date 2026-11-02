import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { commitFiles } from "./commit-files.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const C = "c".repeat(40);

describe("commitFiles", () => {
	it("maps each commit to the files it changed, from a single git call", () => {
		const run = vi.fn(() => `${A}\nclients/a.ts\nutils/b.ts\n${B}\nobservability/z.ts\n`);
		const files = commitFiles("/repo", [A, B], run);
		expect(files.get(A)).toEqual(["clients/a.ts", "utils/b.ts"]);
		expect(files.get(B)).toEqual(["observability/z.ts"]);
		expect(run).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledWith(
			expect.arrayContaining(["diff-tree", "--stdin", "--name-only"]),
			`${A}\n${B}\n`,
			"/repo"
		);
	});

	it("maps a commit that changed nothing to an empty list", () => {
		const files = commitFiles("/repo", [A, C], () => `${A}\nx.ts\n`);
		expect(files.get(C)).toEqual([]);
	});

	it("does not call git for no commits", () => {
		const run = vi.fn(() => "");
		expect(commitFiles("/repo", [], run).size).toBe(0);
		expect(run).not.toHaveBeenCalled();
	});

	it("asks git not to quote unusual paths", () => {
		const run = vi.fn((_args: string[], _input: string, _cwd: string) => `${A}\nnaïve/файл.ts\n`);
		expect(commitFiles("/repo", [A], run).get(A)).toEqual(["naïve/файл.ts"]);
		expect(run.mock.calls[0]?.[0]).toContain("core.quotePath=false");
	});

	it("runs git for real in the given directory", () => {
		const repo = mkdtempSync(join(tmpdir(), "astromech-commit-files-"));
		// Isolate git from the machine running the tests: no global hooks, no commit signing.
		const git = (...args: string[]) =>
			execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], {
				cwd: repo,
				encoding: "utf8",
				env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
			}).trim();
		git("init", "-q");
		mkdirSync(join(repo, "clients"));
		writeFileSync(join(repo, "clients", "a.ts"), "1");
		writeFileSync(join(repo, "root.md"), "1");
		git("add", "-A");
		git("commit", "-q", "-m", "feat: first");
		const hash = git("rev-parse", "HEAD");
		expect(commitFiles(repo, [hash]).get(hash)).toEqual(["clients/a.ts", "root.md"]);
	});
});
