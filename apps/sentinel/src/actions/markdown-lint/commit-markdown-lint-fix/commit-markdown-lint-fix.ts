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
		files: result.fixes.map((f) => ({ path: f.file, content: f.fixed })),
		message: COMMIT_MESSAGE,
	});
}
