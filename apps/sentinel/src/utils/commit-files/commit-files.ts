import type { CommitFilesInput, CommitFilesResult } from "./commit-files.type.js";

export const SENTINEL_SIGNOFF_TRAILER = "Signed-off-by: Holocron Sentinel <sentinel@theholocron.dev>";

/** Appends this org's DCO trailer — every auto-fix-commit action wraps its own message with this rather than hand-writing the trailer. */
export function withSentinelSignoff(message: string): string {
	return [message, "", SENTINEL_SIGNOFF_TRAILER].join("\n");
}

export async function commitFiles(input: CommitFilesInput): Promise<CommitFilesResult> {
	const { client, repo, headSha, headRef, files, message } = input;

	if (files.length === 0) {
		return { committed: false, fileCount: 0 };
	}

	const headCommit = await client.git.getCommit(repo, headSha);

	const treeItems = await Promise.all(
		files.map(async (f) => {
			const blob = await client.git.createBlob(repo, f.content, "utf-8");
			return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
		})
	);
	const tree = await client.git.createTree(repo, treeItems, headCommit.tree.sha);

	const commit = await client.git.createCommit(repo, message, tree.sha, [headSha]);
	await client.git.updateRef(repo, `heads/${headRef}`, commit.sha);

	return { committed: true, commitSha: commit.sha, fileCount: treeItems.length };
}
