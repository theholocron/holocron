import type { GitHubClient } from "@theholocron/github-client";

import type { AutoFixKind } from "../auto-fix-subjects/index.js";

export interface FindAutoFixLoopInput {
	client: Pick<GitHubClient, "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
}

export interface FindAutoFixLoopResult {
	/** The kinds that already committed since the last commit that is not an auto-fix; a fix of one of them is not committed again. */
	blocked: AutoFixKind[];
}
