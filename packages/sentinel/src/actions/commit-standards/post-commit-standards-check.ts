/**
 * Posts one check run reflecting `lintCommits()`'s result — the org-wide,
 * centralized replacement for every repo's own `platform.commitStandards.yml`
 * CI job (holocron#769/#771, `.notes/tech-sentinel-enforcement.spec.md`).
 * Calls `@theholocron/github-client`'s `checks.createCheckRun()` directly,
 * same shape as `post-check-run.ts`'s own capability-compliance check —
 * Sentinel isn't a plugin, and this is a single REST call with nothing
 * else to wrap.
 *
 * D5: `SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME` carries the intent
 * vocabulary through — `<namespace, humanized> / <the existing CI check's
 * own name, unchanged>` — rather than inventing a new ad-hoc label.
 * `platform.commitStandards`'s own reusable workflow job is named "Commit
 * Standards / Run commitlint" (`platform.commitStandards.yml`); this is
 * that same name with `Platform /` carried in front of it, so it's
 * visually obvious in a PR's checks list which CI check this one
 * centralizes. No "Sentinel /" prefix — GitHub's own check-run detail page
 * already shows the posting App's display name ahead of whatever name is
 * set here, so a hand-added prefix just duplicated it.
 */

import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_AXIOM_DATASET_URL, SENTINEL_NAMESPACES } from "../../utils/constants.js";
import type { CommitViolation, LintCommitsResult } from "./lint-commits.js";

export const SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Commit Standards / Run commitlint`;

export interface PostCommitStandardsCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintCommitsResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostCommitStandardsCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

/** One violation as one summary line: `abc1234: subject may not be empty [subject-empty]`. */
function formatViolation(v: CommitViolation): string {
	return `${v.sha.slice(0, 7)}: ${v.message} [${v.rule}]`;
}

export async function postCommitStandardsCheck(
	input: PostCommitStandardsCheckInput
): Promise<PostCommitStandardsCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "failure";

	const affectedCommits = new Set(result.violations.map((v) => v.sha)).size;
	const title = result.valid
		? "Commit standards: OK"
		: `Commit standards: ${result.violations.length} violation(s) across ${affectedCommits} commit(s)`;
	const summary = result.valid
		? `All ${result.commitCount} commit(s) pass.`
		: `${result.violations.length} violation(s) across ${affectedCommits} commit(s) — see details below.`;

	// `text` renders as a collapsible "Show more" section on the check
	// run's own GitHub page — the full per-commit breakdown lives here
	// instead of crammed into the always-visible `summary`. `details_url`
	// still points at Axiom for the underlying structured log line.
	const text = [result.valid ? undefined : result.violations.map(formatViolation).join("\n"), `Run ID: \`${runId}\``]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text },
		details_url: SENTINEL_AXIOM_DATASET_URL,
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
