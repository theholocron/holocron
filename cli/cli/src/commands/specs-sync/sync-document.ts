import {
	ADR_STATUSES,
	CLOSED_STATUSES,
	discussionBody,
	discussionIdLine,
	discussionPrLine,
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
 * into the file as `discussion.url`. With `refreshOrigin` it also rewrites the post's pull request line when that differs from what
 * the current rule writes, and with `refreshTitles` it renames the post when its title differs from the current rule's. The id opens the first message
 * as a link to the file on the default branch (`link`; plain while a pull request is open). Once the file is on the default
 * branch, a post whose id line differs from the current rule's (plain because it was made while the pull request was open,
 * or pointing at a path it no longer has) has that line rewritten, and nothing else; with `refreshLinks` it is rewritten
 * without `link` too, which takes the link off.
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

	// The post is found by the path it was made for; when the file has moved, by the address the file records.
	const url = front?.get("discussion.url")?.value || undefined;

	const file = deps.link ? { ...deps.link, path: doc.path } : undefined;
	const wantedIdLine = discussionIdLine(id, file);
	const wantedTitle = discussionTitle(specTitle(doc.path, doc.text));
	let post: DiscussionPost | undefined;
	if (dryRun) {
		post = await notifications.readDiscussion!(channel, doc.path, url);
		if (!post) return { path: doc.path, did: [...did, "would make the post and link it"], text };
		if (post.key !== undefined && post.key !== doc.path) did.push("would follow the file to its new path");
	} else {
		const ensured = await notifications.ensureDiscussion!({
			channel,
			key: doc.path,
			title: wantedTitle,
			body: discussionBody({
				id,
				summary: specSummary(doc.text),
				...(deps.pr ? { pr: deps.pr } : {}),
				...(file ? { file } : {}),
			}),
			state: status,
			quiet: deps.quiet,
			closed: CLOSED_STATUSES.includes(status),
			...(url ? { url } : {}),
		});
		post = ensured.post;
		if (ensured.created) did.push("made the post");
		if (ensured.rekeyed) did.push("followed the file to its new path");
	}

	// A repair, asked for: give the post the title the current rule writes. Only the title moves, whatever the post's tag or
	// state, so a withdrawn or closed post is renamed like any other. A provider that does not say a post's title leaves
	// nothing to compare, so nothing is renamed.
	let titleRenamed = false;
	if (deps.refreshTitles && post.title !== undefined && post.title !== wantedTitle) {
		titleRenamed = true;
		say(`renamed the post to "${wantedTitle}"`, `would rename the post to "${wantedTitle}"`);
		if (!dryRun) await notifications.updateDiscussion!(channel, doc.path, { title: wantedTitle });
	}

	// A repair, asked for: put the pull request line the current rule would write on a post made under an older one. Only
	// that line moves; the tag, the title, the open or closed state and the synced status are left as they are.
	let prLineRewritten = false;
	if (deps.refreshOrigin) {
		const wanted = discussionPrLine(deps.pr);
		if ((post.prLine ?? "") !== wanted) {
			prLineRewritten = true;
			say(
				wanted ? `rewrote the PR line to #${deps.pr!.number}` : "took the PR line out",
				wanted ? `would rewrite the PR line to #${deps.pr!.number}` : "would take the PR line out"
			);
			if (!dryRun) await notifications.updateDiscussion!(channel, doc.path, { prLine: wanted });
		}
	}

	// The id line follows the file: whenever it is not what the current rule writes (plain because the post was made while its
	// pull request was open, or linked to a path or branch it no longer has) it is rewritten, once the file is on the default
	// branch (`link`) or when asked for (`refreshLinks`, which also takes a link off). The line was read with the post, so a
	// post that is already right costs no request. Only that line moves. A message that does not start with an id says
	// nothing to compare, so nothing is rewritten.
	let idLineRewritten = false;
	if ((deps.link || deps.refreshLinks) && post.idLine !== undefined && post.idLine !== wantedIdLine) {
		idLineRewritten = true;
		say(
			file ? "linked the id to the file" : "took the link off the id",
			file ? "would link the id to the file" : "would take the link off the id"
		);
		if (!dryRun) await notifications.updateDiscussion!(channel, doc.path, { idLine: wantedIdLine });
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

	// A post follows the status its tag shows: a finished status is closed and locked, any other is open. A retag to a
	// finished status closes the post at once, though the file only changes when its pull request merges.
	const shown = decision.action === "request" ? decision.status : status;
	const closed = CLOSED_STATUSES.includes(shown);
	if ((post.closed ?? false) !== closed) {
		say(
			closed ? "closed the post" : "reopened the post",
			closed ? "would close the post" : "would reopen the post"
		);
		if (!dryRun) await notifications.updateDiscussion!(channel, doc.path, { closed });
	}

	if (front?.get("discussion.url")?.value !== post.url) {
		text = updateFrontmatter(text, { discussionUrl: post.url });
		say("linked the post", "would link the post");
	}
	return {
		path: doc.path,
		did,
		text,
		...(prLineRewritten ? { prLineRewritten } : {}),
		...(titleRenamed ? { titleRenamed } : {}),
		...(idLineRewritten ? { idLineRewritten } : {}),
	};
}
