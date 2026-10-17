import { commitFiles, withSentinelSignoff } from "../../../utils/index.js";
import type { CommitFormattingFixInput, CommitFormattingFixResult } from "./commit-formatting-fix.type.js";

const COMMIT_MESSAGE = withSentinelSignoff("style: apply prettier formatting (auto-fix via Sentinel)");

export async function commitFormattingFix(input: CommitFormattingFixInput): Promise<CommitFormattingFixResult> {
	const { client, repo, headSha, headRef, result } = input;

	return commitFiles({
		client,
		repo,
		headSha,
		headRef,
		files: result.messages.map((m) => ({ path: m.file, content: m.formatted })),
		message: COMMIT_MESSAGE,
	});
}
