import type { RunGit } from "@theholocron/kyber/git";

/** The directory a branch is checked out in, among the repo's worktrees, or `undefined` when it is in none. */
export function findWorktree(git: RunGit, cwd: string, branch: string): string | undefined {
	let current: string | undefined;
	for (const line of git(["worktree", "list", "--porcelain"], cwd).split("\n")) {
		if (line.startsWith("worktree ")) current = line.slice("worktree ".length);
		else if (line === `branch refs/heads/${branch}`) return current;
	}
	return undefined;
}
