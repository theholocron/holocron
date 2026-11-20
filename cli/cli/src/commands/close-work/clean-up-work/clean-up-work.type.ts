import type { RunGit } from "@theholocron/kyber/git";

/** What {@link cleanUpWork} needs. */
export interface CleanUpWorkInput {
	/** Runs git; the real one in the command, a fake in a test. */
	git: RunGit;
	/** The repository's root, where git runs. */
	repoRoot: string;
	/** The work's branch. */
	branch: string;
	/** Read only: say what would be removed and remove nothing, local git included. */
	dryRun: boolean;
	/** Leave the worktree, and so its branch, where they are. */
	keepWorktree?: boolean;
	/**
	 * Why the work is over. `merged`: the local branch is deleted only when it is the commit the pull request had, or
	 * holds nothing the remote lacks (a squash merge leaves it unmerged to git, so `-D` is needed). `abandoned`: the
	 * caller has already refused a branch with unpushed commits.
	 */
	mode: "merged" | "abandoned";
	/** The commit the pull request's head had, for `merged`. */
	headSha?: string;
}
