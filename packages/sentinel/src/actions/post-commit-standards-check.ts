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
 * vocabulary through — `Sentinel / <namespace, humanized> / <the existing
 * CI check's own name, unchanged>` — rather than inventing a new ad-hoc
 * label. `platform.commitStandards`'s own reusable workflow job is named
 * "Commit Standards / Run commitlint" (`platform.commitStandards.yml`);
 * this is that same name with `Sentinel / Platform /` carried in front of
 * it, so it's visually obvious in a PR's checks list which CI check this
 * one centralizes. `Sentinel / Capability Compliance` stays its own
 * 2-tier exception — no `astromech` task to namespace it under.
 */

import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_APP_NAME } from "../utils/constants.js";
import type { CommitViolation, LintCommitsResult } from "./lint-commits.js";

export const SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME = `${SENTINEL_APP_NAME} / Platform / Commit Standards / Run commitlint`;

export interface PostCommitStandardsCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintCommitsResult;
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
	const { client, repo, headSha, result } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "failure";

	const title = result.valid
		? "Commit standards: OK"
		: `Commit standards: ${result.violations.length} violation(s) across ${new Set(result.violations.map((v) => v.sha)).size} commit(s)`;
	const summary = result.valid
		? `All ${result.commitCount} commit(s) pass.`
		: result.violations.map(formatViolation).join("\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary },
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
