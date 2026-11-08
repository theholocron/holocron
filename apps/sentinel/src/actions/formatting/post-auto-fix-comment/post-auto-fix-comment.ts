import type { LintFormattingResult } from "../lint-formatting/index.js";
import type { PostAutoFixCommentInput, PostAutoFixCommentResult } from "./post-auto-fix-comment.type.js";

function commentBody(lintResult: LintFormattingResult, commitSha: string | undefined): string {
	// The files the commit wrote: the ones with a fix on a line the pull request added (holocron#1950).
	const committed = lintResult.messages.filter((m) => m.scopedFix !== null);
	const fileList = committed.map((m) => `- \`${m.file}\``).join("\n");
	return [
		`Sentinel auto-formatted ${committed.length} file(s) per this org's shared prettier config:`,
		"",
		fileList,
		"",
		`Commit: ${commitSha}`,
	].join("\n");
}

export async function postAutoFixComment(input: PostAutoFixCommentInput): Promise<PostAutoFixCommentResult> {
	const { client, repo, pullNumber, fixResult, lintResult } = input;

	if (!fixResult.committed) {
		return { posted: false };
	}

	await client.issues.createComment(repo, pullNumber, commentBody(lintResult, fixResult.commitSha));

	return { posted: true };
}
