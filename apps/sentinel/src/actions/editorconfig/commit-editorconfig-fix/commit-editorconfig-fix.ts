import { commitFiles, withSentinelSignoff } from "../../../utils/index.js";
import { AUTO_FIX_SUBJECTS } from "../../auto-fix-loop/auto-fix-subjects/index.js";
import type { CommitEditorConfigFixInput, CommitEditorConfigFixResult } from "./commit-editorconfig-fix.type.js";

const COMMIT_MESSAGE = withSentinelSignoff(AUTO_FIX_SUBJECTS.editorconfig);

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
