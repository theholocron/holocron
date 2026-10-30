import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Source } from "../../plugin/index.js";
import { style } from "../../ui/index.js";
import { classifyBranches } from "./classify-branches.js";
import { BASE_BRANCHES } from "./constants.js";
import { createLocalGit } from "./local-git.js";
import type {
	BranchGroup,
	ClassifiedBranch,
	CleanupBranchesReport,
	RunCleanupBranchesInput,
	SkipReason,
} from "./repo-cleanup-branches.type.js";

const SAFE: readonly BranchGroup[] = ["merged", "squash-merged"];

const GROUP_LABEL: Record<BranchGroup, string> = {
	merged: "merged (an ancestor of a base branch)",
	"squash-merged": "squash-merged (its PR merged and the branch holds nothing beyond it)",
	"has-extra": "merged PR, but the branch has more commits",
	"closed-unmerged": "PR closed without merging",
	"no-pr": "no PR and not merged",
};

const SKIP_LABEL: Record<SkipReason, string> = {
	base: "base branch",
	current: "checked out",
	worktree: "checked out in a worktree",
	"open-pr": "has an open PR",
};

/** Newest commit first, so the branches most likely to be live work head each list. */
function newestFirst(a: ClassifiedBranch, b: ClassifiedBranch): number {
	return b.branch.date.localeCompare(a.branch.date);
}

/**
 * Classifies the local branches against the provider's pull requests and, with `yes`, deletes the ones proven
 * merged. Without it (or on `--dry-run`) nothing is touched. Branches that hold more than their merged PR, or
 * that were never merged, are listed and left alone.
 */
export async function runCleanupBranches(input: RunCleanupBranchesInput): Promise<CleanupBranchesReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const git = input.git ?? createLocalGit(input.context.repoRoot);
	// c8 ignore next -- real PluginLoader construction is integration-level; unit tests always supply loader
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "repo cleanup branches");

	if (!loader.has("source")) {
		throw new Error("source capability is not configured — add a source provider to holocron.config.json");
	}
	const source = loader.get("source") as Source;
	if (!source.listPullRequests || !source.listPullRequestCommits) {
		throw new Error(`${source.providerName} source provider does not support listing pull requests`);
	}
	const { listPullRequests, listPullRequestCommits } = source;

	const excluded = new Map<string, Exclude<SkipReason, "open-pr">>();
	for (const name of git.worktreeBranches()) excluded.set(name, "worktree");
	const current = git.currentBranch();
	if (current) excluded.set(current, "current");
	for (const name of BASE_BRANCHES) excluded.set(name, "base");

	const [openPullRequests, closedPullRequests] = await Promise.all([
		listPullRequests.call(source, "open", input.repo),
		listPullRequests.call(source, "closed", input.repo),
	]);
	const classification = await classifyBranches({
		branches: git.branches(),
		git,
		excluded,
		openPullRequests,
		closedPullRequests,
		pullRequestCommits: (number) => listPullRequestCommits.call(source, number, input.repo),
	});

	const byGroup = (group: BranchGroup) => classification.classified.filter((c) => c.group === group);
	const deletable = classification.classified.filter((c) => SAFE.includes(c.group));
	const dryRun = input.context.dryRun === true || input.yes !== true;

	print("");
	for (const group of Object.keys(GROUP_LABEL) as BranchGroup[]) {
		const rows = byGroup(group);
		const safe = SAFE.includes(group);
		const line = `${rows.length}  ${GROUP_LABEL[group]}`;
		print(safe ? style.success(line) : style.warn(line));
		// A safe group is long and about to go; the groups left alone are the ones worth reading.
		if (!safe) {
			for (const row of [...rows].sort(newestFirst)) {
				const pr = row.pr === undefined ? "" : `  PR #${row.pr}`;
				print(`      ${row.branch.name}  ${style.dim(`${row.branch.date.slice(0, 10)}${pr}`)}`);
			}
		}
	}
	if (classification.skipped.length > 0) {
		print(style.dim(`${classification.skipped.length}  skipped`));
		for (const { branch, reason } of classification.skipped)
			print(style.dim(`      ${branch.name}  ${SKIP_LABEL[reason]}`));
	}
	print("");

	const report: CleanupBranchesReport = { classification, deleted: [], failed: [], status: "ok" };
	if (dryRun) {
		print(style.dim(`Dry run: would delete ${deletable.length} branches. Run with --yes to delete them.`));
		logger.info({ candidates: deletable.length, deleted: 0 }, "repo cleanup branches: dry run");
		return report;
	}

	for (const { branch } of deletable) {
		try {
			git.deleteBranch(branch.name);
			report.deleted.push(branch.name);
		} catch (err) {
			report.failed.push({ name: branch.name, message: errorMessage(err) });
		}
	}
	for (const { name, message } of report.failed) print(style.fail(`${name}: ${message}`));
	print(`Deleted ${report.deleted.length} of ${deletable.length} branches.`);
	if (report.failed.length > 0) report.status = "fail";
	logger.info({ deleted: report.deleted.length, failed: report.failed.length }, "repo cleanup branches: done");
	return report;
}
