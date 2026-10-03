/**
 * Posts one check run reflecting `lintInclusiveLanguage()`'s result — same
 * shape as `post-commit-standards-check.ts`'s own check, the second Bucket 1
 * static-analysis check (holocron#769/#793). Calls
 * `@theholocron/github-client`'s `checks.createCheckRun()` directly —
 * Sentinel isn't a plugin, and this is a single REST call with nothing else
 * to wrap.
 */

import {
	type CheckRunAnnotation,
	type CheckRunConclusion,
	type GitHubClient,
	MAX_CHECK_RUN_ANNOTATIONS,
} from "@theholocron/github-client";

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
 * Two tiers only — no `notice` (holocron#865 follow-up: too easy to miss,
 * too hard to discern from `warning` at a glance; if it's worth flagging
 * at all, it's worth actually seeing). `"error"` fails the whole check
 * (`conclusion: "failure"` below) — a real merge-blocker, not advisory.
 *
 * - **`retext-equality`** (gendered/insensitive phrasing) is `"error"`,
 *   unconditionally. Confirmed directly against the real ruleset: all 425
 *   patterns split across exactly three categories — `a` (dismissive
 *   language and slurs, 222 patterns — "just"/"basically" alongside
 *   "retard"/"japs"), `male`/`female` (203 gendered-noun-pair
 *   suggestions) — every one of them a deliberate call this org isn't
 *   walking back per-word. No severity signal within retext-equality
 *   itself to split on (confirmed: every message comes back `fatal:
 *   false` regardless of word) — org policy is the signal here, not the
 *   tool's own data.
 * - **`retext-profanities`** (violent/vulgar wording) splits on its own
 *   real signal: `profanitySeverity`, `cuss`'s 0-2 rating for how likely
 *   the word is used *as* profanity rather than clean text (not how bad
 *   the word is) — 0 ("beaver"): likely clean text, a frequent false
 *   positive in technical writing, stays `"warning"`; 1-2
 *   ("addict"/"asshat"): actually likely profane, promoted to `"error"`.
 *
 * Supersedes holocron#865/#867's per-word `ALEX_SEVERITY_OVERRIDES` —
 * that mechanism assumed retext-equality needed case-by-case curation;
 * this treats the whole plugin as one already-decided bucket instead, so
 * there's nothing left for a per-word map to differentiate.
 */
function annotationLevel(m: InclusiveLanguageMessage): CheckRunAnnotation["annotation_level"] {
	if (m.source === "retext-equality") return "failure";
	if (m.source === "retext-profanities" && (m.profanitySeverity ?? 0) >= 1) return "failure";
	return "warning";
}

/**
 * One annotation per message, skipped when `line` is the `?? 0` fallback
 * (`lint-inclusive-language.ts`) — GitHub's API requires `start_line` >= 1,
 * and a line-less finding can't be placed on the diff anyway.
 */
function buildAnnotations(messages: InclusiveLanguageMessage[]): CheckRunAnnotation[] {
	return messages
		.filter((m) => m.line > 0)
		.slice(0, MAX_CHECK_RUN_ANNOTATIONS)
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
	const errorCount = result.messages.filter((m) => annotationLevel(m) === "failure").length;
	const warningCount = result.messages.length - errorCount;
	// A real merge-blocker, not advisory, the moment even one finding is
	// error-tier (holocron#865 follow-up) -- warnings alone stay neutral,
	// same as every other Bucket 1 check's advisory stance.
	const conclusion: CheckRunConclusion = errorCount > 0 ? "failure" : result.valid ? "success" : "neutral";

	const title = result.valid
		? "Inclusive language: OK"
		: `Inclusive language: ${errorCount} error(s), ${warningCount} warning(s) across ${result.fileCount} file(s)`;
	const summary = result.valid
		? `All ${result.fileCount} changed markdown file(s) pass.`
		: `${errorCount} error(s), ${warningCount} warning(s) across ${result.fileCount} file(s) — see details below.`;

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
