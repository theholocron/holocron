import { resolve, sep } from "node:path";

import { type CheckRow, describeError } from "@theholocron/kyber/ui";

import { findWorktree } from "../../start-work/find-worktree/index.js";
import { unpushedCommits } from "../unpushed-commits/index.js";
import type { CleanUpWorkInput } from "./clean-up-work.type.js";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/** The first worktree `git worktree list` names, the repository's own checkout, which is never removed. */
function mainWorktree(input: CleanUpWorkInput): string | undefined {
	const first = input.git(["worktree", "list", "--porcelain"], input.repoRoot).split("\n")[0];
	return first?.startsWith("worktree ") ? resolve(first.slice("worktree ".length)) : undefined;
}

/**
 * Removes a finished piece of work's worktree and local branch, and reports whether the remote branch is gone. Nothing
 * is forced: a worktree with uncommitted changes, the main checkout, a worktree the command is running inside and a
 * branch with commits nothing else holds are each left alone with a row saying why. The remote branch is only checked
 * (GitHub deletes it on merge); it is never deleted here. Every step is a probe first, so a second run finds nothing
 * left to do and says so. With `dryRun` every row is `would ...` and nothing, local git included, is written.
 */
export function cleanUpWork(input: CleanUpWorkInput): CheckRow[] {
	const { git, repoRoot, branch, dryRun } = input;
	const rows: CheckRow[] = [];
	// Why the local branch must stay, when the worktree step decided so.
	let keepBranch: string | undefined;

	// The worktree.
	try {
		const path = findWorktree(git, repoRoot, branch);
		if (!path) {
			rows.push(row("worktree", "skip", `none holds ${branch}`));
		} else if (input.keepWorktree) {
			rows.push(row("worktree", "skip", `kept at ${path} (--keep-worktree)`));
			keepBranch = "its worktree is kept";
		} else if (resolve(path) === mainWorktree(input)) {
			rows.push(
				row(
					"worktree",
					"skip",
					`${branch} is checked out in the main checkout; switch it to another branch first`
				)
			);
			keepBranch = "it is checked out in the main checkout";
		} else if (resolve(repoRoot) === resolve(path) || resolve(repoRoot).startsWith(resolve(path) + sep)) {
			rows.push(
				row("worktree", "skip", `${path} is where this command is running; run it from another checkout`)
			);
			keepBranch = "its worktree is where this command is running";
		} else if (git(["status", "--porcelain"], path)) {
			rows.push(
				row("worktree", "fail", `${path} has uncommitted changes; commit or discard them, nothing was removed`)
			);
			keepBranch = "its worktree has uncommitted changes";
		} else if (dryRun) {
			rows.push(row("worktree", "skip", `would remove ${path}`));
		} else {
			git(["worktree", "remove", path], repoRoot);
			rows.push(row("worktree", "ok", `removed ${path}`));
		}
	} catch (err) {
		rows.push(row("worktree", "fail", `could not remove the worktree: ${describeError(err)}`));
		keepBranch = "its worktree could not be removed";
	}

	// The local branch.
	try {
		const unpushed = unpushedCommits(git, repoRoot, branch);
		if (unpushed === undefined) {
			rows.push(row("local branch", "skip", `${branch} is not in this checkout`));
		} else if (keepBranch) {
			rows.push(row("local branch", "skip", `${branch} stays: ${keepBranch}`));
		} else {
			const tip = git(["rev-parse", `refs/heads/${branch}`], repoRoot);
			// A squash merge leaves the branch unmerged to git, so a merged branch is proven by the commit the pull request had.
			const proven = input.mode === "abandoned" || unpushed === 0 || (input.headSha && tip === input.headSha);
			if (!proven) {
				rows.push(
					row(
						"local branch",
						"fail",
						`${branch} holds commits the pull request does not (tip ${tip.slice(0, 7)}); not deleted`
					)
				);
			} else if (dryRun) {
				rows.push(row("local branch", "skip", `would delete ${branch}`));
			} else {
				git(["branch", "-D", branch], repoRoot);
				rows.push(row("local branch", "ok", `deleted ${branch}`));
			}
		}
	} catch (err) {
		rows.push(row("local branch", "fail", `could not delete ${branch}: ${describeError(err)}`));
	}

	// The remote branch: only looked at.
	try {
		const remote = git(["ls-remote", "--heads", "origin", `refs/heads/${branch}`], repoRoot);
		rows.push(
			remote
				? row(
						"remote branch",
						"skip",
						`${branch} is still on origin; GitHub deletes it on merge (the repo setting), or run: git push origin --delete ${branch}`
					)
				: row("remote branch", "ok", `${branch} is gone from origin`)
		);
	} catch (err) {
		rows.push(row("remote branch", "skip", `could not ask origin: ${describeError(err)}`));
	}
	return rows;
}
