import { commitFiles, withSentinelSignoff } from "../../../utils/index.js";
import type { CommitEditorConfigFixInput, CommitEditorConfigFixResult } from "./commit-editorconfig-fix.type.js";

const COMMIT_MESSAGE = withSentinelSignoff("style: apply editorconfig fixes (auto-fix via Sentinel)");

export async function commitEditorConfigFix(input: CommitEditorConfigFixInput): Promise<CommitEditorConfigFixResult> {
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
