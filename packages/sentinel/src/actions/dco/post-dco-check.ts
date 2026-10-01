/**
 * Posts one check run reflecting `lintDco()`'s result — same shape as
 * `post-commit-standards-check.ts`, DCO's own closest analog (a
 * commit-level, not file-level, Bucket 1 check). Always `conclusion:
 * "failure"` on any violation — DCO is a provenance/legal requirement,
 * not a style preference, the same categorical (not severity-based)
 * treatment commit-standards and capability-compliance already use.
 * Calls `@theholocron/github-client`'s `checks.createCheckRun()`
 * directly — Sentinel isn't a plugin, and this is a single REST call
 * with nothing else to wrap.
 *
 * `SENTINEL_DCO_CHECK_RUN_NAME` folds under the `Compliance` grouping
 * alongside the renamed Capability Compliance check (now "Run Holocron
 * config compatibility") — both are provenance/baseline-type checks
 * with no astromech task or CI-job name of their own to carry forward,
 * so "Compliance" names the shared concept and "Run Developer
 * Certificate of Origin" names this one, same `<namespace> / <label> /
 * <command>` shape every other Sentinel check uses, just with a
 * hand-authored "command" instead of a real CI job name.
 *
 * `buildRemediationGuidance()` deliberately offers only the rebase
 * path, not dcoapp's own "DCO Remediation Commit" recipe (a commit
 * whose message retroactively claims a Signed-off-by for an earlier
 * SHA) — `lint-dco.ts`'s own docstring documents that mechanism as
 * deliberately NOT ported, so `lintDco()` has no idea such a commit
 * means anything; offering it here would tell a contributor it clears
 * *this* check when it only ever clears the separate probot/dcoapp one
 * running alongside it. Rebase genuinely works against our own check
 * (it rewrites each commit's own trailer, which is exactly what
 * `isSignedOff()` reads), so that's the one path documented.
 */

import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_DCO_LOG_MSG, SENTINEL_NAMESPACES, sentinelAxiomLogUrl } from "../../utils/constants.js";
import type { DcoViolation, LintDcoResult } from "./lint-dco.js";

export const SENTINEL_DCO_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Compliance / Run Developer Certificate of Origin`;

/** One violation as one summary line: `abc1234: Ada Lovelace <ada@example.com>`. */
function formatViolation(v: DcoViolation): string {
	return `${v.sha.slice(0, 7)}: ${v.author}`;
}

/**
 * The fix-it walkthrough shown only on a violation. `commitCount` is
 * `LintDcoResult.commitCount` (merge/bot commits already excluded) —
 * the `HEAD~<N>` depth it drives can undercount a PR branch that itself
 * contains a merge commit, the one case `lintDco()` already treats as
 * exempt; not worth tracking a second, unfiltered count for a shape of
 * PR branch this org's own `pr-workflow` skill (rebase onto main, never
 * merge main in) steers contributors away from. `headRef` falls back
 * to a placeholder on the (should
 * never happen while `context.pullNumber` is set) chance it's missing.
 */
function buildRemediationGuidance(commitCount: number, headRef: string | undefined): string {
	const branch = headRef ?? "<branch>";
	return [
		"To avoid having PRs blocked in the future, always include `Signed-off-by: Author Name <authoremail@example.com>` in every commit message. You can also do this automatically by using the `-s` flag (i.e., `git commit -s`).",
		"Here is how to fix the problem so that this code can be merged.",
		"## Rebase the branch",
		"If you have a local git environment, you can rebase the branch and add a `Signed-off-by` line to each commit. Please note that if others have already begun work based on the commits in this branch, this will rewrite history and may cause issues for collaborators.",
		"You should only do this if:\n- You are the only author of the commits in this branch\n- You are absolutely certain nobody else is doing any work based on this branch",
		`To add your Signed-off-by line to every commit in this branch:\n1. Check out this pull request locally.\n2. Run: \`git rebase HEAD~${commitCount} --signoff\`\n3. Force push: \`git push --force-with-lease origin ${branch}\``,
	].join("\n\n");
}

export interface PostDcoCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintDcoResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
	/** The PR's own branch name (`pull_request.head.ref`) — used only in the remediation guidance's force-push command. */
	headRef?: string;
}

export interface PostDcoCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postDcoCheck(input: PostDcoCheckInput): Promise<PostDcoCheckResult> {
	const { client, repo, headSha, result, runId, headRef } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "failure";

	const title = result.valid ? "DCO: OK" : `DCO: ${result.violations.length} commit(s) missing a sign-off`;
	const summary = result.valid
		? `All ${result.commitCount} commit(s) are signed off.`
		: `${result.violations.length} of ${result.commitCount} commit(s) are missing a Signed-off-by trailer — see details below.`;

	const text = [
		result.valid ? undefined : result.violations.map(formatViolation).join("\n"),
		`Run ID: \`${runId}\``,
		result.valid ? undefined : buildRemediationGuidance(result.commitCount, headRef),
	]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_DCO_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_DCO_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
