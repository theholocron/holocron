/**
 * Posts one check run reflecting `lintEditorConfig()`'s result — same shape
 * and same advisory-only conclusion as `post-formatting-check.ts` (prettier):
 * `.editorconfig` findings are 100% mechanical, with no severity axis to
 * split on, so `conclusion` never resolves to `"failure"` here regardless
 * of finding count — see `lint-editorconfig.ts`'s own module docstring for
 * why this deliberately doesn't follow eslint/markdownlint/alex's
 * merge-blocking treatment. Calls `@theholocron/github-client`'s
 * `checks.createCheckRun()` directly — Sentinel isn't a plugin, and this is
 * a single REST call with nothing else to wrap.
 */

import type { CheckRunAnnotation, CheckRunConclusion, GitHubClient } from "@theholocron/github-client";

import { SENTINEL_EDITORCONFIG_LOG_MSG, SENTINEL_NAMESPACES, sentinelAxiomLogUrl } from "../../utils/constants.js";
import type { EditorConfigMessage, LintEditorConfigResult } from "./lint-editorconfig.js";

export const SENTINEL_EDITORCONFIG_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.sourceQuality} / Formatting / Run editorconfig`;

/** One message as one summary line: `README.md:12: reason`. */
function formatMessage(m: EditorConfigMessage): string {
	return `${m.file}:${m.line}: ${m.reason}`;
}

/** GitHub's own cap per `createCheckRun()` call (holocron#816) — same reasoning as every other Bucket 1 check's own cap. */
const MAX_ANNOTATIONS_PER_REQUEST = 50;

/** One annotation per message, at the first offending line. `notice` — advisory, matches this check's own always-`"neutral"` (never `"failure"`) conclusion. */
function buildAnnotations(messages: EditorConfigMessage[]): CheckRunAnnotation[] {
	return messages.slice(0, MAX_ANNOTATIONS_PER_REQUEST).map((m) => ({
		path: m.file,
		start_line: m.line,
		end_line: m.line,
		annotation_level: "notice" as const,
		message: m.reason,
		title: "editorconfig",
	}));
}

export interface PostEditorConfigCheckInput {
	client: Pick<GitHubClient, "checks">;
	/** `"owner/repo"`. */
	repo: string;
	/** The commit SHA to attach the check run to — a pull_request event's `pull_request.head.sha`. */
	headSha: string;
	result: LintEditorConfigResult;
	/** `createLogger()`'s own runId for this invocation — surfaced in the check run's `output.text` so a viewer can search Axiom for the exact request. */
	runId: string;
}

export interface PostEditorConfigCheckResult {
	checkRunId: number;
	conclusion: CheckRunConclusion;
	htmlUrl: string;
}

export async function postEditorConfigCheck(input: PostEditorConfigCheckInput): Promise<PostEditorConfigCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "neutral";

	const title = result.valid ? "Editorconfig: OK" : `Editorconfig: ${result.messages.length} finding(s)`;
	const summary = result.valid
		? `All ${result.fileCount} changed file(s) pass.`
		: `${result.messages.length} finding(s) across ${result.fileCount} changed file(s) — see details below.`;

	const text = [result.valid ? undefined : result.messages.map(formatMessage).join("\n"), `Run ID: \`${runId}\``]
		.filter((line) => line !== undefined)
		.join("\n\n");

	const checkRun = await client.checks.createCheckRun(repo, {
		name: SENTINEL_EDITORCONFIG_CHECK_RUN_NAME,
		head_sha: headSha,
		status: "completed",
		conclusion,
		output: { title, summary, text, annotations: buildAnnotations(result.messages) },
		details_url: sentinelAxiomLogUrl(runId, SENTINEL_EDITORCONFIG_LOG_MSG),
	});

	return { checkRunId: checkRun.id, conclusion, htmlUrl: checkRun.html_url };
}
