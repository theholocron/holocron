/**
 * Posts one check run reflecting `lintActionlint()`'s result — same shape
 * as `post-static-analysis-check.ts`'s eslint check, its sibling under the
 * same `sourceQuality.staticAnalysis` task (holocron#904). Calls
 * `@theholocron/github-client`'s `checks.createCheckRun()` directly —
 * Sentinel isn't a plugin, and this is a single REST call with nothing else
 * to wrap.
 */

import type { CheckRunAnnotation, CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import {
	MAX_ANNOTATIONS_PER_REQUEST,
	SENTINEL_ACTIONLINT_LOG_MSG,
	SENTINEL_NAMESPACES,
	sentinelAxiomLogUrl,
} from "../../utils/constants.js";
import { postErrorReview } from "../../utils/post-error-review.js";
import type { ActionlintMessage, LintActionlintResult } from "./lint-actionlint.js";

/**
 * The actionlint half of the CI job's own "Run eslint and actionlint" —
 * split into its own check run next to `Run eslint` rather than folded into
 * it, since the two lint disjoint file sets and fail independently.
 *
 * **Not purely advisory** (same treatment as eslint): `conclusion:
 * "failure"` the moment any message is error-severity — every actionlint
 * finding, and ShellCheck's own `error`/`warning` levels. ShellCheck
 * `info`/`style`-only findings resolve to `"neutral"`.
 */
export const SENTINEL_ACTIONLINT_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.sourceQuality} / Static Analysis / Run actionlint`;

/** One message as one summary line: `.github/workflows/ci.yml:12:3: reason [rule]`. */
function formatMessage(m: ActionlintMessage): string {
	return `${m.file}:${m.line}:${m.column}: ${m.reason} [${m.ruleId}]`;
}

/** One error-severity message as its own review-comment body — GitHub anchors a comment to a line, not a column, so the column lives in the text. */
function formatErrorComment(m: ActionlintMessage): string {
	return `\`${m.ruleId}\` (line ${m.line}, col ${m.column}): ${m.reason}`;
}

/**
 * One `notice` annotation per warning-severity message. Error-severity
 * messages are excluded (holocron#860) — they move to a PR review via
 * `postErrorReview()`, and posting both would show two inline markers on
 * the same line.
 */
function buildAnnotations(messages: ActionlintMessage[]): CheckRunAnnotation[] {
	return messages
		.filter((m) => m.severity === "warning")
		.slice(0, MAX_ANNOTATIONS_PER_REQUEST)
		.map((m) => ({
			path: m.file,
			start_line: m.line,
			end_line: m.line,
			annotation_level: "notice" as const,
			message: m.reason,
			title: m.ruleId,
		}));
}

export interface PostActionlintCheckInput {
	client: Pick<GitHubClient, "checks" | "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintActionlintResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostActionlintCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postActionlintCheck(input: PostActionlintCheckInput): Promise<PostActionlintCheckResult> {
	const { client, repo, pullNumber, headSha, result, runId } = input;

	const errors = result.messages.filter((m) => m.severity === "error");
	const errorCount = errors.length;
	const warningCount = result.messages.length - errorCount;
	const conclusion: CheckRunConclusion = errorCount > 0 ? "failure" : result.valid ? "success" : "neutral";

	const title = result.valid ? "actionlint: OK" : `actionlint: ${errorCount} error(s), ${warningCount} warning(s)`;
	const summary = result.valid
		? `All ${result.fileCount} changed workflow file(s) pass.`
		: `${errorCount} error(s), ${warningCount} warning(s) across ${result.fileCount} changed workflow file(s) — see details below.`;

	const text = [result.valid ? undefined : result.messages.map(formatMessage).join("\n"), `Run ID: \`${runId}\``]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_ACTIONLINT_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text, annotations: buildAnnotations(result.messages) },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_ACTIONLINT_LOG_MSG),
	});

	await postErrorReview({
		client,
		repo,
		pullNumber,
		headSha,
		checkKey: "actionlint",
		checkLabel: "actionlint",
		checkRunName: SENTINEL_ACTIONLINT_CHECK_RUN_NAME,
		errors: errors.map((m) => ({ file: m.file, line: m.line, body: formatErrorComment(m) })),
		warningCount,
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
