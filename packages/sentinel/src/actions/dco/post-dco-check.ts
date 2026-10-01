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
 */

import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_DCO_LOG_MSG, SENTINEL_NAMESPACES, sentinelAxiomLogUrl } from "../../utils/constants.js";
import type { DcoViolation, LintDcoResult } from "./lint-dco.js";

export const SENTINEL_DCO_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Compliance / Run Developer Certificate of Origin`;

/** One violation as one summary line: `abc1234: Ada Lovelace <ada@example.com>`. */
function formatViolation(v: DcoViolation): string {
	return `${v.sha.slice(0, 7)}: ${v.author}`;
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
}

export interface PostDcoCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postDcoCheck(input: PostDcoCheckInput): Promise<PostDcoCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "failure";

	const title = result.valid ? "DCO: OK" : `DCO: ${result.violations.length} commit(s) missing a sign-off`;
	const summary = result.valid
		? `All ${result.commitCount} commit(s) are signed off.`
		: `${result.violations.length} of ${result.commitCount} commit(s) are missing a Signed-off-by trailer — see details below.`;

	const text = [
		result.valid
			? undefined
			: [
					result.violations.map(formatViolation).join("\n"),
					"Run `git commit --amend -s` (last commit) or `git rebase --signoff <base>` (whole branch), then force-push.",
				].join("\n\n"),
		`Run ID: \`${runId}\``,
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
