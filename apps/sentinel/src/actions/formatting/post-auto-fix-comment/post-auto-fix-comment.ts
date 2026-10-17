import type { LintFormattingResult } from "../lint-formatting/index.js";
import type { PostAutoFixCommentInput, PostAutoFixCommentResult } from "./post-auto-fix-comment.type.js";

function commentBody(lintResult: LintFormattingResult, commitSha: string | undefined): string {
	const fileList = lintResult.messages.map((m) => `- \`${m.file}\``).join("\n");
	return [
		`Sentinel auto-formatted ${lintResult.messages.length} file(s) per this org's shared prettier config:`,
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
