import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, PullRequest, RuntimeContext } from "../../plugin/index.js";

/** Where a branch lives. */
export type BranchLocation = "local" | "remote";

/** Which branches the command looks at: this checkout's, the remote's, or both (the default). */
export type CleanupScope = BranchLocation | "both";

/** One branch in one place: its name, the commit it points at there and, for a local one, when that commit was made (ISO 8601). */
export interface BranchRef {
	name: string;
	sha: string;
	date?: string;
	where: BranchLocation;
}

/** What the command asks git; a test supplies its own. */
export interface LocalGit {
	/** Every local branch. */
	branches(): BranchRef[];
	/** The branch the main checkout has out, or `undefined` when its HEAD is detached. */
	currentBranch(): string | undefined;
	/** The branches any worktree has out, the main checkout's included. */
	worktreeBranches(): string[];
	/** Whether `sha` is an ancestor of (or equal to) any of the base branches that exist as `origin/<name>`. */
	isMergedIntoBase(sha: string): boolean;
	/** Whether `sha` is an ancestor of `of`; `false` when either commit is not in the checkout. */
	isAncestor(sha: string, of: string): boolean;
	/** Delete a branch whatever its merge state; throws with git's message on failure. */
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
	ref: BranchRef;
	group: BranchGroup;
	/** The merged PR it matched, for `squash-merged` and `has-extra`. */
	pr?: number;
}

export interface SkippedBranch {
	ref: BranchRef;
	reason: SkipReason;
}

export interface BranchClassification {
	classified: ClassifiedBranch[];
	skipped: SkippedBranch[];
}

export interface ClassifyBranchesInput {
	branches: BranchRef[];
	git: Pick<LocalGit, "isMergedIntoBase" | "isAncestor">;
	/** Why a branch is never a candidate, or `undefined` when it can be one. */
	excluded: (ref: BranchRef) => Exclude<SkipReason, "open-pr"> | undefined;
	/** Pull requests by state; `closed` holds merged and unmerged ones, told apart by `merged`. */
	openPullRequests: PullRequest[];
	closedPullRequests: PullRequest[];
	/** The commit SHAs of one PR, for a tip that is neither the PR's head nor an ancestor of it. */
	pullRequestCommits: (number: number) => Promise<string[]>;
}

/** A branch name with the places it lives in that share a group, so a branch on both sides is one row. */
export interface BranchEntry {
	name: string;
	group: BranchGroup;
	pr?: number;
	locations: BranchLocation[];
	/** The newest commit date among its local refs; a remote ref has none. */
	date?: string;
}

export interface RunCleanupBranchesInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	/** `local`, `remote` or `both` (the default). */
	scope?: CleanupScope;
	/** Delete what is proven merged without asking. Without it, and without `--dry-run`, a checklist asks. */
	yes?: boolean;
	/** "owner/name" override for the provider lookups. */
	repo?: string;
	git?: LocalGit;
	loader?: PluginLoader;
	print?: (line: string) => void;
	logger?: Logger;
}

export interface CleanupBranchesReport {
	classification: BranchClassification;
	/** Branches deleted, by place (empty on a dry run). */
	deleted: Array<{ name: string; where: BranchLocation }>;
	/** Branches that could not be deleted, with the message. */
	failed: Array<{ name: string; where: BranchLocation; message: string }>;
	status: "ok" | "fail";
}
