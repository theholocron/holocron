/**
 * Posts one check run reflecting `lintEditorConfig()`'s result. Unlike
 * `post-formatting-check.ts` (prettier), `conclusion` DOES resolve to
 * `"failure"` on any violation — but every property this check covers is
 * also auto-fixable (`commit-editorconfig-fix.ts`, wired in `handler.ts`
 * right after this posts), so a failure here is meant to be transient:
 * the auto-fix commit supersedes it with a passing check on the new
 * commit. A failure that survives means the fix couldn't be applied
 * automatically (`indent_style`'s own best-effort limits — see
 * `lint-editorconfig.ts`'s module docstring) and a human needs to act on
 * the same annotations this check already posted. Calls
 * `@theholocron/github-client`'s `checks.createCheckRun()` directly —
 * Sentinel isn't a plugin, and this is a single REST call with nothing
 * else to wrap.
 */

import {
	type CheckRunAnnotation,
	type CheckRunConclusion,
	MAX_CHECK_RUN_ANNOTATIONS,
} from "@theholocron/github-client";

import { SENTINEL_EDITORCONFIG_LOG_MSG, SENTINEL_NAMESPACES, sentinelAxiomLogUrl } from "../../../utils/index.js";
import type { EditorConfigMessage } from "../lint-editorconfig/index.js";
import type { PostEditorConfigCheckInput, PostEditorConfigCheckResult } from "./post-editorconfig-check.type.js";

export const SENTINEL_EDITORCONFIG_CHECK_RUN_NAME = `${SENTINEL_NAMESPACES.sourceQuality} / Formatting / Run editorconfig`;

/** One message as one summary line: `README.md:12: reason`. */
function formatMessage(m: EditorConfigMessage): string {
	return `${m.file}:${m.line}: ${m.reason}`;
}

/** One annotation per message, at the first offending line. `notice` — same level eslint/markdownlint's own failure-capable checks already use for their annotations; `conclusion` (not `annotation_level`) is what actually drives merge-blocking. */
function buildAnnotations(messages: EditorConfigMessage[]): CheckRunAnnotation[] {
	return messages.slice(0, MAX_CHECK_RUN_ANNOTATIONS).map((m) => ({
		path: m.file,
		start_line: m.line,
		end_line: m.line,
		annotation_level: "notice" as const,
		message: m.reason,
		title: "editorconfig",
	}));
}

export async function postEditorConfigCheck(input: PostEditorConfigCheckInput): Promise<PostEditorConfigCheckResult> {
	const { client, repo, headSha, result, runId } = input;
	const conclusion: CheckRunConclusion = result.valid ? "success" : "failure";

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
