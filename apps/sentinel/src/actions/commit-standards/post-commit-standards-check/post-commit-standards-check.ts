/**
 * Posts one check run reflecting `lintCommits()`'s result — the org-wide,
 * centralized replacement for every repo's own `platform.commitStandards.yml`
 * CI job (holocron#769/#771, `.notes/tech-sentinel-enforcement.spec.md`).
 * Calls `@theholocron/github-client`'s `checks.createCheckRun()` directly,
 * same shape as `post-check-run.ts`'s own capability-compliance check —
 * Sentinel isn't a plugin, and this is a single REST call with nothing
 * else to wrap.
 *
 * `SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME` is `sentinel:lint:commits / Run commitlint`
 * (`sentinelCheckName()`, `.notes/ci-sentinel-check-names.spec.md`). The
 * task id is `lint:commits`, as on the Actions side: a repo still on the frozen
 * reusables posts "Commit Standards / Run commitlint" from Actions, and an
 * exact clash with this check would be confusing. No "Sentinel /" prefix —
 * GitHub's own check-run detail page already shows the posting App's
 * display name ahead of whatever name is set here, so a hand-added prefix
 * just duplicated it.
 */

import type { CheckRunConclusion } from "@theholocron/github-client";

import { SENTINEL_COMMIT_STANDARDS_LOG_MSG, sentinelAxiomLogUrl, sentinelCheckName } from "../../../utils/index.js";
import type { CommitViolation } from "../lint-commits/index.js";
import type {
	PostCommitStandardsCheckInput,
	PostCommitStandardsCheckResult,
} from "./post-commit-standards-check.type.js";

export const SENTINEL_COMMIT_STANDARDS_CHECK_RUN_NAME = sentinelCheckName("lint:commits", "Run commitlint");

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
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_COMMIT_STANDARDS_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
