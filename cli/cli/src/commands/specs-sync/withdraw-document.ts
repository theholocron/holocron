import { WITHDRAWN_STATE } from "@theholocron/astromech/repo-validation";

import type { SpecDocument, SpecSyncOutcome, WithdrawDocumentDeps } from "./specs-sync.type.js";

/**
 * Mark the discussion post of a document `withdrawn` and close it, for a pull request that was closed without merging
 * (#1653). It reads nothing from the file, which is not in the working tree (the run is on the base branch): the post is
 * found by the document's path alone. The post's last-synced status stays, so that when the pull request is reopened, or
 * the same file comes back in another, `syncDocument` puts the file's own status back on the tag and reopens the post.
 *
 * A path that is in the working tree is a document the base branch already has, so its post is the merged file's and
 * stays as it is: this pull request only proposed a change to it. A path with no post has nothing to withdraw. On a dry run
 * nothing is changed, and `did` says what would be.
 */
export async function withdrawDocument(doc: SpecDocument, deps: WithdrawDocumentDeps): Promise<SpecSyncOutcome> {
	const { notifications, channel, dryRun, onBase } = deps;
	const outcome = (did: string[]): SpecSyncOutcome => ({ path: doc.path, did, text: doc.text });
	if (onBase) return outcome(["kept its post: the file is on the base branch"]);

	const post = await notifications.readDiscussion!(channel, doc.path);
	if (!post) return outcome(["has no post to withdraw"]);
	if (post.state === WITHDRAWN_STATE && post.closed) return outcome([]);

	if (!dryRun) await notifications.updateDiscussion!(channel, doc.path, { state: WITHDRAWN_STATE, closed: true });
	return outcome([dryRun ? "would withdraw the post" : "withdrew the post"]);
}
