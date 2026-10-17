/**
 * Posts one check run reflecting `validateAdrs()`'s result (holocron#913) —
 * same shape as `post-actionlint-check.ts`: error-severity findings fail the
 * check and post as a PR review via the shared `postErrorReview()`, while
 * warning-severity findings become `notice` annotations on a `neutral`
 * check.
 */

import {
	type CheckRunAnnotation,
	type CheckRunConclusion,
	MAX_CHECK_RUN_ANNOTATIONS,
} from "@theholocron/github-client";

import {
	postErrorReview,
	SENTINEL_ADRS_LOG_MSG,
	SENTINEL_NAMESPACES,
	sentinelAxiomLogUrl,
} from "../../../utils/index.js";
import type { AdrMessage } from "../validate-adrs/index.js";
import type { PostAdrsCheckInput, PostAdrsCheckResult } from "./post-adrs-check.type.js";

/** Mirrors the CI job's own name (`Repo Validation / Validate ADRs and specs`) under the `platform` namespace its task lives in. */
export const SENTINEL_ADRS_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.platform} / Repo Validation / Validate ADRs and specs`;

function formatMessage(m: AdrMessage): string {
	return `${m.file}:${m.line}: ${m.reason} [${m.rule}]`;
}

function formatErrorComment(m: AdrMessage): string {
	return `\`${m.rule}\` (line ${m.line}): ${m.reason}`;
}

function buildAnnotations(messages: AdrMessage[]): CheckRunAnnotation[] {
	return messages
		.filter((m) => m.severity === "warning")
		.slice(0, MAX_CHECK_RUN_ANNOTATIONS)
		.map((m) => ({
			path: m.file,
			start_line: m.line,
			end_line: m.line,
			annotation_level: "notice" as const,
			message: m.reason,
			title: m.rule,
		}));
}

export async function postAdrsCheck(input: PostAdrsCheckInput): Promise<PostAdrsCheckResult> {
	const { client, repo, pullNumber, headSha, result, runId } = input;

	const errors = result.messages.filter((m) => m.severity === "error");
	const errorCount = errors.length;
	const warningCount = result.messages.length - errorCount;
	const conclusion: CheckRunConclusion = errorCount > 0 ? "failure" : result.valid ? "success" : "neutral";

	const title = result.valid
		? "ADRs and specs: OK"
		: `ADRs and specs: ${errorCount} error(s), ${warningCount} warning(s)`;
	const summary = result.valid
		? `All ${result.fileCount} changed ADR/spec file(s) pass.`
		: `${errorCount} error(s), ${warningCount} warning(s) across ${result.fileCount} changed ADR/spec file(s) — see details below.`;
	const text = [result.valid ? undefined : result.messages.map(formatMessage).join("\n"), `Run ID: \`${runId}\``]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_ADRS_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text, annotations: buildAnnotations(result.messages) },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_ADRS_LOG_MSG),
	});

	await postErrorReview({
		client,
		repo,
		pullNumber,
		headSha,
		checkKey: "adrs",
		checkLabel: "ADR/spec validation",
		checkRunName: SENTINEL_ADRS_CHECK_RUN_NAME,
		errors: errors.map((m) => ({ file: m.file, line: m.line, body: formatErrorComment(m) })),
		warningCount,
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
