import type { RunGit } from "@theholocron/kyber/git";

/**
 * How many commits of a local branch no remote branch holds (`git rev-list --count <branch> --not --remotes`), judged by
 * the remote-tracking branches this checkout has, so a stale checkout errs on the side of saying a commit is unpushed.
 * `undefined` when the branch does not exist here.
 */
export function unpushedCommits(git: RunGit, cwd: string, branch: string): number | undefined {
	try {
		git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], cwd);
	} catch {
		return undefined;
	}
	return Number(git(["rev-list", "--count", `refs/heads/${branch}`, "--not", "--remotes"], cwd)) || 0;
}
