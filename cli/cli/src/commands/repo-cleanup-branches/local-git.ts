import { spawnSync } from "node:child_process";

import { BASE_BRANCHES } from "./constants.js";
import type { BranchRef, LocalGit } from "./repo-cleanup-branches.type.js";

/** `git` run in `cwd`, no shell: its trimmed stdout and stderr, and whether it exited 0. */
function git(cwd: string, args: string[]): { out: string; ok: boolean; err: string } {
	const r = spawnSync("git", args, { cwd, encoding: "utf8" });
	return { out: (r.stdout ?? "").trim(), ok: r.status === 0, err: (r.stderr ?? "").trim() };
}

/** {@link LocalGit} over the checkout at `cwd`. */
export function createLocalGit(cwd: string): LocalGit {
	return {
		branches(): BranchRef[] {
			const { out } = git(cwd, [
				"for-each-ref",
				"--format=%(refname:short)%09%(objectname)%09%(committerdate:iso-strict)",
				"refs/heads",
			]);
			return out
				.split("\n")
				.filter(Boolean)
				.map((line): BranchRef => {
					const [name = "", sha = "", date = ""] = line.split("\t");
					return { name, sha, date, where: "local" };
				});
		},

		currentBranch(): string | undefined {
			return git(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]).out || undefined;
		},

		worktreeBranches(): string[] {
			return git(cwd, ["worktree", "list", "--porcelain"])
				.out.split("\n")
				.filter((line) => line.startsWith("branch refs/heads/"))
				.map((line) => line.slice("branch refs/heads/".length));
		},

		isMergedIntoBase(sha: string): boolean {
			return BASE_BRANCHES.some((base) => git(cwd, ["merge-base", "--is-ancestor", sha, `origin/${base}`]).ok);
		},

		isAncestor(sha: string, of: string): boolean {
			return git(cwd, ["merge-base", "--is-ancestor", sha, of]).ok;
		},

		deleteBranch(name: string): void {
			const r = git(cwd, ["branch", "-D", "--", name]);
			if (!r.ok) throw new Error(r.err || `git branch -D ${name} failed`);
		},
	};
}
