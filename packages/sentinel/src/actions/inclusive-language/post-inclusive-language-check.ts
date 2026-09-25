/**
 * Posts one check run reflecting `lintInclusiveLanguage()`'s result — same
 * shape as `post-commit-standards-check.ts`'s own check, the second Bucket 1
 * static-analysis check (holocron#769/#793). Calls
 * `@theholocron/github-client`'s `checks.createCheckRun()` directly —
 * Sentinel isn't a plugin, and this is a single REST call with nothing else
 * to wrap.
 */

import type { CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

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
		output: { title, summary, text },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_INCLUSIVE_LANGUAGE_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
