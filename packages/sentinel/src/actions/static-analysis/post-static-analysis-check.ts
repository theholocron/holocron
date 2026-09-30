/**
 * Posts one check run reflecting `lintStaticAnalysis()`'s result — same
 * shape as `post-markdown-lint-check.ts`'s own check, the fifth Bucket 1
 * static-analysis check (holocron#769/#849). Calls
 * `@theholocron/github-client`'s `checks.createCheckRun()` directly —
 * Sentinel isn't a plugin, and this is a single REST call with nothing else
 * to wrap.
 */

import type { CheckRunAnnotation, CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_NAMESPACES, SENTINEL_STATIC_ANALYSIS_LOG_MSG, sentinelAxiomLogUrl } from "../../utils/constants.js";
import { postErrorReview } from "../../utils/post-error-review.js";
import type { LintStaticAnalysisResult, StaticAnalysisMessage } from "./lint-static-analysis.js";

/**
 * The fifth Bucket 1 static-analysis check (holocron#769/#849) — confirms
 * the "config-free rules, no checkout needed" pattern generalizes a fourth
 * time beyond commitlint/alex/prettier/markdownlint. `library()`'s shared
 * bundle works directly against fetched file content via eslint's real
 * `Linter.verify()` API — no checkout, no type-aware rules to require one.
 *
 * Same `sourceQuality` namespace as Inclusive Language, Formatting, and
 * Documentation — the spec's own forecast ("the next namespace... once
 * eslint/prettier move to Sentinel too") named exactly this kind of tool.
 *
 * **Not purely advisory** (same treatment inclusive language got in
 * holocron#865): `conclusion: "failure"` the moment any message is
 * error-severity — eslint's own `m.severity`, a real merge-blocker, not
 * only a PR-review comment (holocron#860). Warning-severity-only findings
 * still resolve to `"neutral"` — advisory, same as before.
 */
export const SENTINEL_STATIC_ANALYSIS_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.sourceQuality} / Static Analysis / Run eslint`;

/** One message as one summary line: `src/index.ts:12:3: reason [rule-id]`. */
function formatMessage(m: StaticAnalysisMessage): string {
	return `${m.file}:${m.line}:${m.column}: ${m.reason}${m.ruleId ? ` [${m.ruleId}]` : ""}`;
}

/** One error-severity message as its own review-comment body — GitHub anchors a comment to a line, not a column, so the column lives in the text. */
function formatErrorComment(m: StaticAnalysisMessage): string {
	return `\`${m.ruleId ?? "parse error"}\` (line ${m.line}, col ${m.column}): ${m.reason}`;
}

/** GitHub's own cap per `createCheckRun()` call (holocron#816) — same reasoning as `post-formatting-check.ts`'s own cap. */
const MAX_ANNOTATIONS_PER_REQUEST = 50;

/**
 * One annotation per warning-severity message, at the line/column eslint
 * reported. Error-severity messages are excluded here (holocron#860) — they
 * move to a PR review instead (posted separately by the caller via
 * `postErrorReview()`), and posting both would show two separate inline
 * markers on the same line. `notice`, not `warning`/`failure` — a
 * warning-severity finding stays advisory-styled regardless of the overall
 * check run's own `conclusion` now being failure-aware; the merge-blocking
 * signal lives entirely in `conclusion`, not in any individual annotation's
 * level.
 */
function buildAnnotations(messages: StaticAnalysisMessage[]): CheckRunAnnotation[] {
	return messages
		.filter((m) => m.severity === "warning")
		.slice(0, MAX_ANNOTATIONS_PER_REQUEST)
		.map((m) => ({
			path: m.file,
			start_line: m.line,
			end_line: m.line,
			annotation_level: "notice" as const,
			message: m.reason,
			title: m.ruleId ?? "parse error",
		}));
}

export interface PostStaticAnalysisCheckInput {
	client: Pick<GitHubClient, "checks" | "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintStaticAnalysisResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostStaticAnalysisCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postStaticAnalysisCheck(
	input: PostStaticAnalysisCheckInput
): Promise<PostStaticAnalysisCheckResult> {
	const { client, repo, pullNumber, headSha, result, runId } = input;

	const errors = result.messages.filter((m) => m.severity === "error");
	const errorCount = errors.length;
	const warningCount = result.messages.length - errorCount;
	const conclusion: CheckRunConclusion = errorCount > 0 ? "failure" : result.valid ? "success" : "neutral";

	const title = result.valid
		? "Static analysis: OK"
		: `Static analysis: ${errorCount} error(s), ${warningCount} warning(s)`;
	const summary = result.valid
		? `All ${result.fileCount} changed file(s) pass.`
		: `${errorCount} error(s), ${warningCount} warning(s) across ${result.fileCount} changed file(s) — see details below.`;

	const text = [result.valid ? undefined : result.messages.map(formatMessage).join("\n"), `Run ID: \`${runId}\``]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_STATIC_ANALYSIS_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text, annotations: buildAnnotations(result.messages) },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_STATIC_ANALYSIS_LOG_MSG),
	});

	await postErrorReview({
		client,
		repo,
		pullNumber,
		headSha,
		checkKey: "static-analysis",
		checkLabel: "static analysis",
		checkRunName: SENTINEL_STATIC_ANALYSIS_CHECK_RUN_NAME,
		errors: errors.map((m) => ({ file: m.file, line: m.line, body: formatErrorComment(m) })),
		warningCount,
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
