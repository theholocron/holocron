/**
 * Posts one check run reflecting `lintInclusiveLanguage()`'s result — same
 * shape as `post-commit-standards-check.ts`'s own check, the second Bucket 1
 * static-analysis check (holocron#769/#793). Calls
 * `@theholocron/github-client`'s `checks.createCheckRun()` directly —
 * Sentinel isn't a plugin, and this is a single REST call with nothing else
 * to wrap.
 */

import type { CheckRunAnnotation, CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import {
	SENTINEL_INCLUSIVE_LANGUAGE_LOG_MSG,
	SENTINEL_NAMESPACES,
	sentinelAxiomLogUrl,
} from "../../utils/constants.js";
import type { InclusiveLanguageMessage, LintInclusiveLanguageResult } from "./lint-inclusive-language.js";

/**
 * The second Bucket 1 static-analysis check (holocron#769/#793,
 * `tech-sentinel-ci-runner.spec.md`) — confirms the "config-free, no
 * checkout needed" pattern commit-standards proved generalizes, rather
 * than being commitlint-specific. `yamllint` (the tool actually used in
 * this org's CI today) has no real Node.js package at all — Python-only —
 * disqualified by the spec's own "confirm a real programmatic API" rule.
 * `alex` does, confirmed directly (`markdown(value, config)` /
 * `mdx(value, config)`, both returning a `VFile` with real `.messages`).
 *
 * Folds under a new `sourceQuality` namespace — the spec's own forecast for
 * "the next namespace... once eslint/prettier move to Sentinel too" fits an
 * inclusive-language content check just as well as those.
 */
export const SENTINEL_INCLUSIVE_LANGUAGE_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.sourceQuality} / Inclusive Language / Run alex`;

export interface PostInclusiveLanguageCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintInclusiveLanguageResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostInclusiveLanguageCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

/** One message as one summary line: `README.md:3:5: reason [ruleId]`. */
function formatMessage(m: InclusiveLanguageMessage): string {
	return `${m.file}:${m.line}:${m.column}: ${m.reason} [${m.ruleId}]`;
}

/**
 * GitHub's own cap per `createCheckRun()` call (holocron#816) — a PR with
 * more findings than this would need a follow-up `updateCheckRun()` PATCH
 * to attach the rest, which this doesn't do yet. `text`'s full breakdown
 * (`formatMessage()`, above) never truncates, so nothing is silently lost
 * even when annotations are capped — just less visible inline.
 */
const MAX_ANNOTATIONS_PER_REQUEST = 50;

/**
 * Per-message severity, not a blanket level for the whole check. `alex`
 * bundles two underlying retext plugins with very different confidence
 * profiles:
 *
 * - `retext-equality` (gendered/insensitive phrasing — "he", "actor") has
 *   no severity signal of its own; every finding here is a soft "consider
 *   rewording" suggestion, so it stays `notice` (grey).
 * - `retext-profanities` (violent/vulgar wording — "execute", "kill")
 *   carries `profanitySeverity`, `cuss`'s own 0-2 rating for how likely
 *   the word is used *as* profanity rather than clean text (not how bad
 *   the word is) — 0 ("beaver"): likely clean text, frequently a false
 *   positive in technical writing; 1-2 ("addict"/"asshat"): actually
 *   likely profane. Only the latter is worth calling out more loudly than
 *   the equality suggestions above, hence `warning` (yellow) at severity
 *   >= 1. Capped at `warning`, never `failure` — this check's own overall
 *   `conclusion` stays `"neutral"` (advisory, not a hard gate), and a red
 *   annotation on a non-failing check reads as a mismatched signal.
 */
function annotationLevel(m: InclusiveLanguageMessage): CheckRunAnnotation["annotation_level"] {
	if (m.source === "retext-profanities" && (m.profanitySeverity ?? 0) >= 1) return "warning";
	return "notice";
}

/**
 * One annotation per message, skipped when `line` is the `?? 0` fallback
 * (`lint-inclusive-language.ts`) — GitHub's API requires `start_line` >= 1,
 * and a line-less finding can't be placed on the diff anyway.
 */
function buildAnnotations(messages: InclusiveLanguageMessage[]): CheckRunAnnotation[] {
	return messages
		.filter((m) => m.line > 0)
		.slice(0, MAX_ANNOTATIONS_PER_REQUEST)
		.map((m) => ({
			path: m.file,
			start_line: m.line,
			end_line: m.line,
			...(m.column > 0 ? { start_column: m.column, end_column: m.column } : {}),
			annotation_level: annotationLevel(m),
			message: m.reason,
			title: m.ruleId,
		}));
}

export async function postInclusiveLanguageCheck(
	input: PostInclusiveLanguageCheckInput
): Promise<PostInclusiveLanguageCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "neutral";

	const title = result.valid
		? "Inclusive language: OK"
		: `Inclusive language: ${result.messages.length} suggestion(s) across ${result.fileCount} file(s)`;
	const summary = result.valid
		? `All ${result.fileCount} changed markdown file(s) pass.`
		: `${result.messages.length} suggestion(s) across ${result.fileCount} file(s) — see details below.`;

	// `text` renders as a collapsible "Show more" section on the check run's
	// own GitHub page — the full per-file breakdown lives here instead of
	// crammed into the always-visible `summary`. `details_url` points at the
	// exact Axiom log line this post logged.
	const text = [result.valid ? undefined : result.messages.map(formatMessage).join("\n"), `Run ID: \`${runId}\``]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_INCLUSIVE_LANGUAGE_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text, annotations: buildAnnotations(result.messages) },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_INCLUSIVE_LANGUAGE_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
