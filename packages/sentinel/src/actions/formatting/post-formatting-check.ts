/**
 * Posts one check run reflecting `lintFormatting()`'s result — same shape
 * as `post-inclusive-language-check.ts`'s own check, the third Bucket 1
 * static-analysis check (holocron#769/#819). Calls
 * `@theholocron/github-client`'s `checks.createCheckRun()` directly —
 * Sentinel isn't a plugin, and this is a single REST call with nothing else
 * to wrap.
 */

import type { CheckRunAnnotation, CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_FORMATTING_LOG_MSG, SENTINEL_NAMESPACES, sentinelAxiomLogUrl } from "../../utils/constants.js";
import type { FormattingMessage, LintFormattingResult } from "./lint-formatting.js";

/**
 * The third Bucket 1 static-analysis check (holocron#769/#819) — confirms
 * the "config-free, no checkout needed" pattern generalizes a third time,
 * beyond commitlint and alex. `@theholocron/prettier-config`'s default
 * export is already one canonical, importable config (no per-repo
 * customization anywhere in the org, confirmed during #680's earlier
 * scoping), and `prettier`'s real Node API (`check()`/`format()`/
 * `getFileInfo()`) works directly on fetched file content — no checkout.
 *
 * Same `sourceQuality` namespace as Inclusive Language — the spec's own
 * forecast ("the next namespace... once eslint/prettier move to Sentinel
 * too") named this exact tool.
 */
export const SENTINEL_FORMATTING_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.sourceQuality} / Formatting / Run prettier`;

export interface PostFormattingCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintFormattingResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostFormattingCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

/** One message as one summary line: `README.md:12: reason`. */
function formatMessage(m: FormattingMessage): string {
	return `${m.file}:${m.line}: ${m.reason}`;
}

/** GitHub's own cap per `createCheckRun()` call (holocron#816) — same reasoning as `post-inclusive-language-check.ts`'s own cap. */
const MAX_ANNOTATIONS_PER_REQUEST = 50;

/**
 * One annotation per message, at the first line prettier's own reformatted
 * output diverges from the original. `notice` (not `warning`/`failure`)
 * matches this check's own `conclusion: "neutral"` — advisory, not a hard
 * gate, same rollout shape Inclusive Language and Commit Standards used
 * before either was made required.
 */
function buildAnnotations(messages: FormattingMessage[]): CheckRunAnnotation[] {
	return messages.slice(0, MAX_ANNOTATIONS_PER_REQUEST).map((m) => ({
		path: m.file,
		start_line: m.line,
		end_line: m.line,
		annotation_level: "notice" as const,
		message: m.reason,
		title: "prettier",
	}));
}

export async function postFormattingCheck(input: PostFormattingCheckInput): Promise<PostFormattingCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "neutral";

	const title = result.valid ? "Formatting: OK" : `Formatting: ${result.messages.length} file(s) need reformatting`;
	const summary = result.valid
		? `All ${result.fileCount} changed file(s) pass.`
		: `${result.messages.length} of ${result.fileCount} changed file(s) need reformatting — see details below.`;

	// `text` renders as a collapsible "Show more" section on the check run's
	// own GitHub page — the full per-file breakdown lives here instead of
	// crammed into the always-visible `summary`. `details_url` points at the
	// exact Axiom log line this post logged.
	const text = [result.valid ? undefined : result.messages.map(formatMessage).join("\n"), `Run ID: \`${runId}\``]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_FORMATTING_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text, annotations: buildAnnotations(result.messages) },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_FORMATTING_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
