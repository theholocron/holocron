import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, PullRequest, RuntimeContext } from "../../plugin/index.js";

/** One local branch: its name, the commit it points at, and when that commit was made (ISO 8601). */
export interface LocalBranch {
	name: string;
	sha: string;
	date: string;
}

/** What the command asks git; a test supplies its own. */
export interface LocalGit {
	/** Every local branch. */
	branches(): LocalBranch[];
	/** The branch the main checkout has out, or `undefined` when its HEAD is detached. */
	currentBranch(): string | undefined;
	/** The branches any worktree has out, the main checkout's included. */
	worktreeBranches(): string[];
	/** Whether `sha` is an ancestor of (or equal to) any of the base branches that exist as `origin/<name>`. */
	isMergedIntoBase(sha: string): boolean;
	/** Whether `sha` is an ancestor of `of`; `false` when either commit is not in the checkout. */
	isAncestor(sha: string, of: string): boolean;
	/** Delete a branch whatever its merge state (`git branch -D`); throws with git's message on failure. */
	deleteBranch(name: string): void;
}

/** Why a branch is never a candidate. */
export type SkipReason = "base" | "current" | "worktree" | "open-pr";

/**
 * Where a branch ends up:
 * - `merged`: an ancestor of a base branch. Safe to delete.
 * - `squash-merged`: a merged PR has this branch as its head and the tip is that PR's head, an ancestor of it, or one of its commits. Safe to delete.
 * - `has-extra`: a merged PR has this branch as its head, but the tip is none of those, so the branch holds more.
 * - `closed-unmerged`: its PR was closed without merging.
 * - `no-pr`: no PR and not merged.
 */
export type BranchGroup = "merged" | "squash-merged" | "has-extra" | "closed-unmerged" | "no-pr";

export interface ClassifiedBranch {
	branch: LocalBranch;
	group: BranchGroup;
	/** The merged PR it matched, for `squash-merged` and `has-extra`. */
	pr?: number;
}

export interface SkippedBranch {
	branch: LocalBranch;
	reason: SkipReason;
}

export interface BranchClassification {
	classified: ClassifiedBranch[];
	skipped: SkippedBranch[];
}

export interface ClassifyBranchesInput {
	branches: LocalBranch[];
	git: Pick<LocalGit, "isMergedIntoBase" | "isAncestor">;
	/** Branch names that are never candidates, with why. */
	excluded: ReadonlyMap<string, Exclude<SkipReason, "open-pr">>;
	/** Pull requests by state; `closed` holds merged and unmerged ones, told apart by `merged`. */
	openPullRequests: PullRequest[];
	closedPullRequests: PullRequest[];
	/** The commit SHAs of one PR, for a tip that is neither the PR's head nor an ancestor of it. */
	pullRequestCommits: (number: number) => Promise<string[]>;
}

export interface RunCleanupBranchesInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** Delete what is proven merged. Without it nothing is touched. */
	yes?: boolean;
	/** "owner/name" override for the PR lookup. */
	repo?: string;
	git?: LocalGit;
	loader?: PluginLoader;
	print?: (line: string) => void;
	logger?: Logger;
}

export interface CleanupBranchesReport {
	classification: BranchClassification;
	/** Branches deleted (empty on a dry run). */
	deleted: string[];
	/** Branches git refused to delete, with its message. */
	failed: Array<{ name: string; message: string }>;
	status: "ok" | "fail";
}
