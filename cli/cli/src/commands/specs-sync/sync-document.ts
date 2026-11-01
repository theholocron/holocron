import {
	ADR_STATUSES,
	discussionBody,
	discussionTitle,
	parseFrontmatter,
	reconcileSpecStatus,
	SPEC_STATUSES,
	specSummary,
	specTitle,
	updateFrontmatter,
} from "@theholocron/astromech/repo-validation";

import type { DiscussionPost } from "../../plugin/index.js";
import type { SpecDocument, SpecSyncOutcome, SyncDocumentDeps } from "./specs-sync.type.js";

/**
 * Bring one ADR or spec and its discussion post in step. A spec with no `id` is numbered. The post is found or made, opening with the id, a short description and the pull request that added the document; then the document's status, the
 * tag on the post and the status last synced decide what to do (`reconcileSpecStatus`): put the file's status on the tag,
 * remember that they agree, or, when someone retagged the post, change the file's `status:`. The post's address is written
 * into the file as `discussion.url`.
 *
 * It returns the document's text after the sync and never writes it: the caller decides whether to. On a dry run it makes
 * and changes nothing, and `did` says what it would. A document that cannot be synced comes back with a `problem`.
 */
export async function syncDocument(doc: SpecDocument, deps: SyncDocumentDeps): Promise<SpecSyncOutcome> {
	const { notifications, channel, dryRun } = deps;
	const front = parseFrontmatter(doc.text);
	const status = front?.get("status")?.value || undefined;
	const statuses = doc.kind === "adr" ? ADR_STATUSES : SPEC_STATUSES;
	const unsynced = (problem: string): SpecSyncOutcome => ({ path: doc.path, did: [], problem, text: doc.text });
	if (!status) return unsynced("has no status in its front matter; `holocron probe specs check` says more");
	if (!statuses.includes(status))
		return unsynced(`status \`${status}\` is not a status of an ${doc.kind.toUpperCase()}`);

	const did: string[] = [];
	const say = (done: string, would: string): void => void did.push(dryRun ? would : done);

	let text = doc.text;
	const id = front?.get("id")?.value || deps.assignedId;
	if (!id) return unsynced("has no id in its front matter; `holocron probe specs check` says more");
	if (deps.assignedId && !front?.get("id")?.value) {
		text = updateFrontmatter(text, { id });
		say(`numbered it ${id}`, `would number it ${id}`);
	}

	let post: DiscussionPost | undefined;
	if (dryRun) {
		post = await notifications.readDiscussion!(channel, doc.path);
		if (!post) return { path: doc.path, did: [...did, "would make the post and link it"], text };
	} else {
		const ensured = await notifications.ensureDiscussion!({
			channel,
			key: doc.path,
			title: discussionTitle(doc.kind, specTitle(doc.path, doc.text)),
			body: discussionBody({ id, summary: specSummary(doc.text), ...(deps.pr ? { pr: deps.pr } : {}) }),
			state: status,
			quiet: deps.quiet,
		});
		post = ensured.post;
		if (ensured.created) did.push("made the post");
	}

	const decision = reconcileSpecStatus({ file: status, tag: post.state, synced: post.synced });
	switch (decision.action) {
		case "none":
			break;
		case "record":
			say("recorded that the post and the file agree", "would record that the post and the file agree");
			if (!dryRun) await notifications.updateDiscussion!(channel, doc.path, { synced: status });
			break;
		case "set-tag":
			say(`set the tag to ${status}`, `would set the tag to ${status}`);
			if (!dryRun) await notifications.updateDiscussion!(channel, doc.path, { state: status, synced: status });
			break;
		case "request":
			if (!statuses.includes(decision.status)) {
				return unsynced(
					`the tag asks for \`${decision.status}\`, which is not a status of an ${doc.kind.toUpperCase()}; retag it or change the file`
				);
			}
			// The post's last-synced status stays: it moves only once the change is merged, so that the next run does not
			// take the file's old status for a newer one and put it back on the tag.
			text = updateFrontmatter(text, { status: decision.status });
			say(
				`moved status to ${decision.status}, as the tag asks`,
				`would move status to ${decision.status}, as the tag asks`
			);
			break;
		case "conflict":
			return unsynced(decision.reason);
	}

	if (front?.get("discussion.url")?.value !== post.url) {
		text = updateFrontmatter(text, { discussionUrl: post.url });
		say("linked the post", "would link the post");
	}
	return { path: doc.path, did, text };
}
