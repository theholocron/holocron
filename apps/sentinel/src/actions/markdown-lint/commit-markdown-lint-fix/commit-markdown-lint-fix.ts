import { commitFiles, withSentinelSignoff } from "../../../utils/index.js";
import { AUTO_FIX_SUBJECTS } from "../../auto-fix-loop/auto-fix-subjects/index.js";
import type { CommitMarkdownLintFixInput, CommitMarkdownLintFixResult } from "./commit-markdown-lint-fix.type.js";

const COMMIT_MESSAGE = withSentinelSignoff(AUTO_FIX_SUBJECTS["markdown-lint"]);

export async function commitMarkdownLintFix(input: CommitMarkdownLintFixInput): Promise<CommitMarkdownLintFixResult> {
	const { client, repo, headSha, headRef, result } = input;

	return commitFiles({
		client,
		repo,
		headSha,
		headRef,
		// Only the part of the fix on lines the pull request added (holocron#1950); a file with none is left out.
		files: result.fixes.flatMap((f) => (f.scopedFix === null ? [] : [{ path: f.file, content: f.scopedFix }])),
		message: COMMIT_MESSAGE,
	});
}
