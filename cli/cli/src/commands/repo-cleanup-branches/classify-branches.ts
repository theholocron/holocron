import type { PullRequest } from "../../plugin/index.js";
import type {
	BranchClassification,
	BranchRef,
	ClassifiedBranch,
	ClassifyBranchesInput,
} from "./repo-cleanup-branches.type.js";

/** The merged PRs that had this branch as their head, newest first (the order the provider lists them). */
function mergedFor(name: string, closed: PullRequest[]): PullRequest[] {
	return closed.filter((pr) => pr.merged && pr.branch === name);
}

/**
 * Whether a merged PR accounts for a branch's tip: it is the PR's head, an ancestor of it, or (when the head
 * commit is not in the checkout) one of the PR's own commits. The provider is asked for the commits last, and
 * only for a branch the cheaper checks did not settle.
 */
async function accounts(pr: PullRequest, tip: string, input: ClassifyBranchesInput): Promise<boolean> {
	if (pr.headSha === undefined) return (await input.pullRequestCommits(pr.number)).includes(tip);
	if (tip === pr.headSha || input.git.isAncestor(tip, pr.headSha)) return true;
	return (await input.pullRequestCommits(pr.number)).includes(tip);
}

async function classifyOne(ref: BranchRef, input: ClassifyBranchesInput): Promise<ClassifiedBranch> {
	if (input.git.isMergedIntoBase(ref.sha)) return { ref, group: "merged" };
	const merged = mergedFor(ref.name, input.closedPullRequests);
	for (const pr of merged) {
		if (await accounts(pr, ref.sha, input)) return { ref, group: "squash-merged", pr: pr.number };
	}
	const newest = merged[0];
	if (newest) return { ref, group: "has-extra", pr: newest.number };
	const closed = input.closedPullRequests.some((pr) => pr.branch === ref.name);
	return { ref, group: closed ? "closed-unmerged" : "no-pr" };
}

/**
 * Sorts branches, local and remote, into what is proven merged and what is not. A branch is skipped outright
 * when it is excluded (a base branch, or locally the checked-out one or one a worktree has out) or has an open
 * PR; the rest are classified by {@link BranchGroup}. Nothing here deletes.
 */
export async function classifyBranches(input: ClassifyBranchesInput): Promise<BranchClassification> {
	const open = new Set(input.openPullRequests.map((pr) => pr.branch));
	const classification: BranchClassification = { classified: [], skipped: [] };
	for (const ref of input.branches) {
		const excluded = input.excluded(ref);
		if (excluded) classification.skipped.push({ ref, reason: excluded });
		else if (open.has(ref.name)) classification.skipped.push({ ref, reason: "open-pr" });
		else classification.classified.push(await classifyOne(ref, input));
	}
	return classification;
}
