import type { GitHubClient } from "@theholocron/github-client";

export interface CommitFilesInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** The branch's current head commit SHA — the new commit's own (sole) parent. */
	headSha: string;
	/** The branch name (not a SHA) — `updateRef()` moves `heads/<headRef>` to the new commit. */
	headRef: string;
	/** Files to write, each at its full repo-relative path. Empty → no-op, `committed: false`. */
	files: Array<{ path: string; content: string }>;
	/** The commit's own subject + body — pass it through `withSentinelSignoff()` for DCO. */
	message: string;
}

export interface CommitFilesResult {
	committed: boolean;
	/** Only present when `committed` is `true`. */
	commitSha?: string;
	fileCount: number;
}
