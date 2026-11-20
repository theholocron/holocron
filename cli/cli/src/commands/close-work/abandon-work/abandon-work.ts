import { runGit } from "@theholocron/kyber/git";
import { type CheckRow, describeError } from "@theholocron/kyber/ui";

import { runIssueUpdate } from "../../issue-update/run-issue-update/index.js";
import { cleanUpWork } from "../clean-up-work/index.js";
import { findSpecFiles } from "../find-spec-files/index.js";
import { findWorkBranches } from "../find-work-branches/index.js";
import { unpushedCommits } from "../unpushed-commits/index.js";
import type { AbandonWorkInput, AbandonWorkResult } from "./abandon-work.type.js";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/**
 * `close work --abandon`: closes the pull request, withdraws the spec's discussion post, removes the worktree and local
 * branch and asks whether to close the issue as not planned. It stops, writing nothing, when the branch holds commits no
 * remote branch has (they would be lost with the branch), and asks first (`--yes` answers for the person; a dry run runs
 * the reads and says what it would do). A step that fails does not stop the ones after it, so a rerun carries on.
 */
export async function abandonWork(a: AbandonWorkInput): Promise<AbandonWorkResult> {
	const { input, key, source, pullRequest: pr } = a;
	const git = input.git ?? runGit;
	const repoRoot = input.context.repoRoot;
	const dryRun = Boolean(input.context.dryRun);
	const rows: CheckRow[] = [];

	// The branch: the pull request's, else the one named for the issue.
	let branch = pr?.branch;
	if (!branch) {
		let found: string[];
		try {
			found = findWorkBranches(git, repoRoot, key);
		} catch (err) {
			return { rows: [row("local branch", "fail", `could not list the branches: ${describeError(err)}`)] };
		}
		if (found.length > 1) {
			return {
				rows: [
					row(
						"local branch",
						"fail",
						`${found.length} branches are named for ${key} (${found.join(", ")}); --pr names the pull request whose branch to remove`
					),
				],
			};
		}
		branch = found[0];
	}

	// Commits only this checkout holds are the one thing the abandonment would lose, so it stops before any write.
	if (branch) {
		let unpushed: number | undefined;
		try {
			unpushed = unpushedCommits(git, repoRoot, branch);
		} catch (err) {
			return { rows: [row("unpushed commits", "fail", `could not read ${branch}: ${describeError(err)}`)] };
		}
		if (unpushed !== undefined && unpushed > 0) {
			return {
				rows: [
					row(
						"unpushed commits",
						"fail",
						`${branch} holds ${unpushed} commit${unpushed === 1 ? "" : "s"} no remote branch has; push ${unpushed === 1 ? "it" : "them"} or delete the branch by hand. Nothing was changed`
					),
				],
			};
		}
	}

	if (!dryRun && !input.yes) {
		const what = [
			...(pr ? [`close pull request #${pr.number}`] : []),
			"withdraw the spec's post",
			...(branch ? [`remove the worktree and local branch ${branch}`] : []),
		];
		if (!(await a.ask(`Abandon the work on ${key}: ${what.join(", ")}?`))) return { rows, cancelled: true };
	}

	// The pull request.
	let specFiles: string[] = [];
	if (!pr) {
		rows.push(row("pull request", "skip", `no open pull request for ${key}`));
	} else {
		try {
			specFiles = source.listPullRequestFiles ? findSpecFiles(await source.listPullRequestFiles(pr.number)) : [];
		} catch (err) {
			rows.push(row("spec", "fail", `could not read the pull request's files: ${describeError(err)}`));
		}
		if (pr.state !== "open") {
			rows.push(row("pull request", "skip", `#${pr.number} is already closed`));
		} else if (!source.updatePullRequest) {
			rows.push(
				row("pull request", "fail", `the \`${source.providerName}\` provider cannot close a pull request`)
			);
		} else if (dryRun) {
			rows.push(row("pull request", "skip", `would close #${pr.number}`));
		} else {
			try {
				await source.updatePullRequest(pr.number, { state: "closed" });
				rows.push(row("pull request", "ok", `closed #${pr.number}`));
			} catch (err) {
				rows.push(row("pull request", "fail", `could not close #${pr.number}: ${describeError(err)}`));
			}
		}
	}

	// The spec's discussion post.
	if (pr && !rows.some((r) => r.id === "spec")) {
		if (specFiles.length === 0) {
			rows.push(row("spec", "skip", "the pull request holds no spec or ADR, so no post to withdraw"));
		} else if (!input.withdrawSpecs) {
			rows.push(row("spec", "fail", "no way to withdraw the post was given"));
		} else {
			try {
				const result = await input.withdrawSpecs(specFiles);
				rows.push(row("spec", result.ok ? "ok" : "fail", `${specFiles.join(", ")}: ${result.detail}`));
			} catch (err) {
				rows.push(row("spec", "fail", `could not withdraw the post: ${describeError(err)}`));
			}
		}
	}

	// The worktree and the local branch.
	if (branch) {
		rows.push(
			...cleanUpWork({
				git,
				repoRoot,
				branch,
				dryRun,
				mode: "abandoned",
				...(input.keepWorktree ? { keepWorktree: true } : {}),
			})
		);
	} else {
		rows.push(row("local branch", "skip", `no local branch is named for ${key}`));
	}

	// The issue: only on a yes, never by default.
	if (dryRun) {
		rows.push(row("issue", "skip", `would ask whether to close ${key} as not planned`));
	} else if (input.yes) {
		rows.push(
			row(
				"issue",
				"skip",
				`${key} left open: --yes does not close an issue; run \`holocron update issue ${key} --state closed\` to close it`
			)
		);
	} else if (await a.ask(`Close ${key} as not planned?`)) {
		const close = await (input.updateIssue ?? runIssueUpdate)({
			key,
			state: "closed",
			stateReason: "not_planned",
			loaded: input.loaded,
			context: input.context,
			loader: a.loader,
			yes: true,
			print: () => {},
		});
		for (const r of close.rows) rows.push({ ...r, id: `issue: ${r.id}`, title: `issue: ${r.title}` });
	} else {
		rows.push(row("issue", "skip", `${key} left open`));
	}
	return { rows };
}
