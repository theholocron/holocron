import { checkbox, confirm, Separator } from "@inquirer/prompts";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { assertPluginsResolvable, PluginLoader, type Source } from "../../plugin/index.js";
import { NonInteractiveError, style } from "../../ui/index.js";
import { classifyBranches } from "./classify-branches.js";
import { BASE_BRANCHES } from "./constants.js";
import { groupBranches } from "./group-branches.js";
import { createLocalGit } from "./local-git.js";
import type {
	BranchEntry,
	BranchGroup,
	BranchRef,
	CleanupBranchesReport,
	RunCleanupBranchesInput,
	SkipReason,
} from "./repo-cleanup-branches.type.js";

const GROUPS: readonly BranchGroup[] = ["merged", "squash-merged", "has-extra", "closed-unmerged", "no-pr"];

/** The two groups that are proven merged: ticked in the checklist, and what `--yes` deletes. */
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

/** A row's label: the name, where it lives, when it was last committed to (local only) and its PR. */
function rowLabel(entry: BranchEntry): string {
	const detail = [entry.date?.slice(0, 10), entry.pr === undefined ? undefined : `PR #${entry.pr}`].filter(Boolean);
	return `${entry.name}  [${entry.locations.join(", ")}]${detail.length > 0 ? `  ${style.dim(detail.join("  "))}` : ""}`;
}

/**
 * Classifies the branches against the provider's pull requests, shows them grouped, and deletes the ones
 * chosen. With no flag it covers local and remote branches, each row saying where the branch lives.
 *
 * - `--dry-run` stops after the list.
 * - `--yes` deletes every proven-merged branch without asking.
 * - Otherwise it asks, then offers a checklist of every branch with the proven-merged ones ticked.
 */
export async function runCleanupBranches(input: RunCleanupBranchesInput): Promise<CleanupBranchesReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const scope = input.scope ?? "both";
	const git = input.git ?? createLocalGit(input.context.repoRoot);
	// c8 ignore next -- real PluginLoader construction is integration-level; unit tests always supply loader
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "repo cleanup branches");

	if (!loader.has("source")) {
		throw new Error("source capability is not configured — add a source provider to holocron.config.json");
	}
	const source = loader.get("source") as Source;
	const { listPullRequests, listPullRequestCommits, listBranches, deleteBranch } = source;
	if (!listPullRequests || !listPullRequestCommits) {
		throw new Error(`${source.providerName} source provider does not support listing pull requests`);
	}
	if (scope !== "local" && (!listBranches || !deleteBranch)) {
		throw new Error(`${source.providerName} source provider does not support listing and deleting remote branches`);
	}

	const worktrees = new Set(scope === "remote" ? [] : git.worktreeBranches());
	const current = scope === "remote" ? undefined : git.currentBranch();
	const refs: BranchRef[] = [];
	if (scope !== "remote") refs.push(...git.branches());
	if (scope !== "local") {
		const remote = await listBranches!.call(source, input.repo);
		refs.push(...remote.map((b): BranchRef => ({ name: b.name, sha: b.sha, where: "remote" })));
	}

	const [openPullRequests, closedPullRequests] = await Promise.all([
		listPullRequests.call(source, "open", input.repo),
		listPullRequests.call(source, "closed", input.repo),
	]);
	const classification = await classifyBranches({
		branches: refs,
		git,
		excluded: (ref) => {
			if ((BASE_BRANCHES as readonly string[]).includes(ref.name)) return "base";
			if (ref.where === "remote") return undefined;
			if (ref.name === current) return "current";
			return worktrees.has(ref.name) ? "worktree" : undefined;
		},
		openPullRequests,
		closedPullRequests,
		pullRequestCommits: (number) => listPullRequestCommits.call(source, number, input.repo),
	});

	const entries = groupBranches(classification.classified);
	const report: CleanupBranchesReport = { classification, deleted: [], failed: [], status: "ok" };

	print("");
	for (const group of GROUPS) {
		const rows = entries.filter((e) => e.group === group);
		const line = `${rows.length}  ${GROUP_LABEL[group]}`;
		print(SAFE.includes(group) ? style.success(line) : style.warn(line));
		for (const row of rows) print(`      ${rowLabel(row)}`);
	}
	if (classification.skipped.length > 0) {
		print(style.dim(`${classification.skipped.length}  skipped`));
		for (const { ref, reason } of classification.skipped) {
			print(style.dim(`      ${ref.name}  [${ref.where}]  ${SKIP_LABEL[reason]}`));
		}
	}
	print("");

	const safe = entries.filter((e) => SAFE.includes(e.group));
	if (input.context.dryRun === true) {
		print(style.dim(`Dry run: ${safe.length} branches are proven merged. Nothing was deleted.`));
		logger.info({ proven: safe.length, deleted: 0 }, "repo cleanup branches: dry run");
		return report;
	}
	if (entries.length === 0) return report;

	let chosen: BranchEntry[] = safe;
	if (input.yes !== true) {
		if (!process.stdin.isTTY) {
			throw new NonInteractiveError(
				"`repo cleanup branches` asks which branches to delete — run it in a terminal, or pass --yes to delete the proven-merged ones, or --dry-run to only list them"
			);
		}
		if (!(await confirm({ message: "Choose branches to delete?", default: true }))) return report;
		const picked = await checkbox<number>({
			message: "Delete which branches? (the proven-merged ones are ticked)",
			pageSize: 20,
			choices: GROUPS.flatMap((group) => {
				const rows = entries.filter((e) => e.group === group);
				if (rows.length === 0) return [];
				return [
					new Separator(`── ${GROUP_LABEL[group]} (${rows.length})`),
					...rows.map((row) => ({
						name: rowLabel(row),
						value: entries.indexOf(row),
						checked: SAFE.includes(group),
					})),
				];
			}),
		});
		chosen = picked.map((index) => entries[index]!);
	}

	for (const entry of chosen) {
		for (const where of entry.locations) {
			try {
				if (where === "local") git.deleteBranch(entry.name);
				else await deleteBranch!.call(source, entry.name, input.repo);
				report.deleted.push({ name: entry.name, where });
			} catch (err) {
				report.failed.push({ name: entry.name, where, message: errorMessage(err) });
			}
		}
	}
	for (const { name, where, message } of report.failed) print(style.fail(`${name} [${where}]: ${message}`));
	print(`Deleted ${report.deleted.length} of ${report.deleted.length + report.failed.length} branches.`);
	if (report.failed.length > 0) report.status = "fail";
	logger.info({ deleted: report.deleted.length, failed: report.failed.length }, "repo cleanup branches: done");
	return report;
}
