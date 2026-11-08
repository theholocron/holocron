import type { GitHubClient } from "@theholocron/github-client";

import type { AutoFixKind } from "../auto-fix-subjects/index.js";

export interface PostAutoFixLoopCommentInput {
	client: Pick<GitHubClient, "issues">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The fixers that were stopped because they had already committed. */
	kinds: AutoFixKind[];
	/** The files those fixers would have written again. */
	files: string[];
}

export interface PostAutoFixLoopCommentResult {
	/** `false` when the pull request already has the comment. */
	posted: boolean;
}
