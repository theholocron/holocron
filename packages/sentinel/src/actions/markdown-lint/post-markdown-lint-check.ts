/**
 * Posts one check run reflecting `lintMarkdown()`'s result — same shape as
 * `post-formatting-check.ts`'s own check, the fourth Bucket 1
 * static-analysis check (holocron#769/#821). Calls
 * `@theholocron/github-client`'s `checks.createCheckRun()` directly —
 * Sentinel isn't a plugin, and this is a single REST call with nothing else
 * to wrap.
 */

import type { CheckRunAnnotation, CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_MARKDOWN_LINT_LOG_MSG, SENTINEL_NAMESPACES, sentinelAxiomLogUrl } from "../../utils/constants.js";
import { postErrorReview } from "../../utils/post-error-review.js";
import type { LintMarkdownResult, MarkdownLintMessage } from "./lint-markdown.js";

/**
 * The fourth Bucket 1 static-analysis check (holocron#769/#821) — confirms
 * the "config-free, no checkout needed" pattern generalizes a third time
 * beyond commitlint/alex/prettier. `@theholocron/markdownlint-config`'s
 * default export is already one canonical, importable config, and
 * `markdownlint`'s real Node API (`lint()` from `markdownlint/promise`)
 * works directly on fetched file content — no checkout.
 *
 * Same `sourceQuality` namespace as Inclusive Language and Formatting — the
 * spec's own forecast ("the next namespace... once eslint/prettier move to
 * Sentinel too") named exactly this kind of tool.
 *
 * **Not purely advisory** (same treatment inclusive language got in
 * holocron#865, and static analysis in holocron#873): `conclusion:
 * "failure"` the moment any message is error-severity — markdownlint's own
 * `m.severity`, `"error"` by default until `@theholocron/markdownlint-config`
 * curates individual rules down to `"warning"` — a real merge-blocker, not
 * only a PR-review comment (holocron#860). Warning-severity-only findings
 * still resolve to `"neutral"` — advisory, same as before.
 */
export const SENTINEL_MARKDOWN_LINT_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.sourceQuality} / Documentation / Run markdownlint`;

/** One message as one summary line: `README.md:12: reason [rule-name]`. */
function formatMessage(m: MarkdownLintMessage): string {
	return `${m.file}:${m.line}: ${m.reason} [${m.ruleNames.join("/")}]`;
}

/**
 * One error-severity message as its own review-comment body — GitHub
 * anchors a comment to a line, not a column, so `errorRange`'s
 * `[startColumn, length]` (when present) lives in the text instead.
 */
function formatErrorComment(m: MarkdownLintMessage): string {
	const column = m.errorRange ? `, col ${m.errorRange[0]}` : "";
	return `\`${m.ruleNames.join("/")}\` (line ${m.line}${column}): ${m.reason}`;
}

/** GitHub's own cap per `createCheckRun()` call (holocron#816) — same reasoning as `post-formatting-check.ts`'s own cap. */
const MAX_ANNOTATIONS_PER_REQUEST = 50;

/**
 * One annotation per warning-severity message, at the line markdownlint
 * reported. Error-severity messages are excluded here (holocron#860) — they
 * move to a PR review instead (posted separately by the caller via
 * `postErrorReview()`), and posting both would show two separate inline
 * markers on the same line. `start_column`/`end_column` only when
 * `errorRange` localizes the finding to a specific span — some rules (e.g.
 * a whole-heading-level finding) can't. `notice`, not `warning`/`failure` —
 * a warning-severity finding stays advisory-styled regardless of the
 * overall check run's own `conclusion` now being failure-aware; the
 * merge-blocking signal lives entirely in `conclusion`, not in any
 * individual annotation's level.
 */
function buildAnnotations(messages: MarkdownLintMessage[]): CheckRunAnnotation[] {
	return messages
		.filter((m) => m.severity === "warning")
		.slice(0, MAX_ANNOTATIONS_PER_REQUEST)
		.map((m) => ({
			path: m.file,
			start_line: m.line,
			end_line: m.line,
			...(m.errorRange
				? { start_column: m.errorRange[0], end_column: m.errorRange[0]! + m.errorRange[1]! - 1 }
				: {}),
			annotation_level: "notice" as const,
			message: m.reason,
			title: m.ruleNames.join("/"),
		}));
}

export interface PostMarkdownLintCheckInput {
	client: Pick<GitHubClient, "checks" | "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintMarkdownResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostMarkdownLintCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postMarkdownLintCheck(input: PostMarkdownLintCheckInput): Promise<PostMarkdownLintCheckResult> {
	const { client, repo, pullNumber, headSha, result, runId } = input;

	const errors = result.messages.filter((m) => m.severity === "error");
	const errorCount = errors.length;
	const warningCount = result.messages.length - errorCount;
	const conclusion: CheckRunConclusion = errorCount > 0 ? "failure" : result.valid ? "success" : "neutral";

	const title = result.valid
		? "Markdown lint: OK"
		: `Markdown lint: ${errorCount} error(s), ${warningCount} warning(s)`;
	const summary = result.valid
		? `All ${result.fileCount} changed markdown file(s) pass.`
		: `${errorCount} error(s), ${warningCount} warning(s) across ${result.fileCount} changed markdown file(s) — see details below.`;

	const text = [result.valid ? undefined : result.messages.map(formatMessage).join("\n"), `Run ID: \`${runId}\``]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_MARKDOWN_LINT_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text, annotations: buildAnnotations(result.messages) },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_MARKDOWN_LINT_LOG_MSG),
	});

	await postErrorReview({
		client,
		repo,
		pullNumber,
		headSha,
		checkKey: "markdown-lint",
		checkLabel: "markdown lint",
		checkRunName: SENTINEL_MARKDOWN_LINT_CHECK_RUN_NAME,
		errors: errors.map((m) => ({ file: m.file, line: m.line, body: formatErrorComment(m) })),
		warningCount,
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
