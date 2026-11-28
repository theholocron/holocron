import { commitFiles, withSentinelSignoff } from "../../../utils/index.js";
import { AUTO_FIX_SUBJECTS } from "../../auto-fix-loop/auto-fix-subjects/index.js";
import type { CommitFormattingFixInput, CommitFormattingFixResult } from "./commit-formatting-fix.type.js";

const COMMIT_MESSAGE = withSentinelSignoff(AUTO_FIX_SUBJECTS.formatting);

export async function commitFormattingFix(input: CommitFormattingFixInput): Promise<CommitFormattingFixResult> {
	const { client, repo, headSha, headRef, result } = input;

	return commitFiles({
		client,
		repo,
		headSha,
		headRef,
		// Only the part of the fix on lines the pull request added (holocron#1950); a file with none is left out.
		files: result.messages.flatMap((m) => (m.scopedFix === null ? [] : [{ path: m.file, content: m.scopedFix }])),
		message: COMMIT_MESSAGE,
	});
}
