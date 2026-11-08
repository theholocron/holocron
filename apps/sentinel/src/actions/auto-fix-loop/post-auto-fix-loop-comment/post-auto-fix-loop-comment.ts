import type { AutoFixKind } from "../auto-fix-subjects/index.js";
import type { PostAutoFixLoopCommentInput, PostAutoFixLoopCommentResult } from "./post-auto-fix-loop-comment.type.js";

/** Looked for before posting, so a loop is explained once however many deliveries find it. */
export const AUTO_FIX_LOOP_MARKER = "<!-- sentinel:auto-fix-loop -->";

const FIXER_NAMES: Record<AutoFixKind, string> = {
	formatting: "prettier",
	"markdown-lint": "markdownlint",
	editorconfig: "editorconfig",
};

function commentBody(kinds: AutoFixKind[], files: string[]): string {
	const names = kinds.map((k) => FIXER_NAMES[k]).join(" and ");
	return [
		`Sentinel stopped auto-fixing this pull request: its ${names} fix already ran here and the same file(s) need it again, so another commit would only repeat the loop (typically two fixers whose output each other reject).`,
		"",
		...files.map((f) => `- \`${f}\``),
		"",
		"Fix them by hand; the checks keep reporting them until then. A new commit of yours starts auto-fixing again.",
		AUTO_FIX_LOOP_MARKER,
	].join("\n");
}

export async function postAutoFixLoopComment(
	input: PostAutoFixLoopCommentInput
): Promise<PostAutoFixLoopCommentResult> {
	const { client, repo, pullNumber, kinds, files } = input;

	const existing = await client.issues.listComments(repo, pullNumber);
	if (existing.some((c) => c.body.includes(AUTO_FIX_LOOP_MARKER))) return { posted: false };

	await client.issues.createComment(repo, pullNumber, commentBody(kinds, files));
	return { posted: true };
}
