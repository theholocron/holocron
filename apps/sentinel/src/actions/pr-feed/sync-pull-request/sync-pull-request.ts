import { SENTINEL_PR_FEED_CHECK_NAME } from "../../../utils/constants/index.js";
import { ciMessageMarker } from "../ci-message-marker/index.js";
import { lastLifecycleKind, type LifecycleKind, renderLifecycleLine } from "../lifecycle-line/index.js";
import type { CiVerdict } from "../pr-feed.type.js";
import { prKey } from "../pr-key/index.js";
import { readPullRequestState } from "../read-pull-request-state/index.js";
import { renderCiMessage } from "../render-ci-message/index.js";
import { renderPullRequest } from "../render-pull-request/index.js";
import type { PrFeedPullResult, SyncPullRequestInput } from "./sync-pull-request.type.js";

/** The conclusions of a check that count as not succeeding. */
const FAILED = new Set(["failure", "timed_out", "cancelled"]);

/**
 * Brings one pull request's post in line with GitHub (holocron#1833, spec `tech-sentinel-pr-feed`): reads the state,
 * makes the post if it is missing (quietly; the oldest wins if two deliveries raced) or edits its summary and tag, then
 * appends what the delivery calls for: the `opened`, `reopened` and `closed` lines (each once: the thread is read for
 * the last one first), and, for the `ci / Required checks` verdict of a commit, one CI message (also once, by its
 * marker). A closed pull request's post gets its last line before it is closed, so the line can be written; a closed
 * pull request with no post is not given one.
 */
export async function syncPullRequest(input: SyncPullRequestInput): Promise<PrFeedPullResult> {
	const { client, notifications, channel, repo, number, trigger, now } = input;
	const skipped = (reason: string): PrFeedPullResult => ({ number, outcome: "skipped", reason, posted: [] });

	const snapshot = await readPullRequestState({ client, repo, number, now });
	const { state } = snapshot;
	if (channel.excludeAuthors.some((a) => a.toLowerCase() === state.author.toLowerCase())) {
		return skipped(`${state.author} is excluded`);
	}
	const action = trigger.kind === "pull_request" ? trigger.action : undefined;
	const closing = action === "closed" && state.closed;
	// A late delivery for a pull request that has finished changes nothing a reader needs.
	if (state.closed && !closing) return skipped("the pull request is closed");

	const key = prKey(repo, number);
	if (closing && !(await notifications.readDiscussion(channel.name, key))) return skipped("it has no post to close");

	const rendered = renderPullRequest(state, now);
	const ensured = await notifications.ensureDiscussion({
		channel: channel.name,
		key,
		title: rendered.title,
		body: rendered.body,
		state: rendered.tag,
		quiet: true,
	});
	// A post this delivery made may have raced another delivery's, on another instance that had not read the forum
	// since: the forum is read again, the oldest post is kept, and the writes below go to it.
	let deduped = 0;
	if (ensured.created) {
		deduped = (await notifications.dedupeDiscussion(channel.name, key, { refresh: true })) ?? 0;
	} else {
		await notifications.updateDiscussion(channel.name, key, {
			title: rendered.title,
			body: rendered.body,
			state: rendered.tag,
			// A reopened pull request opens its post again; the line below is written to an open post.
			...(ensured.post.closed && !state.closed ? { closed: false } : {}),
		});
	}

	const posted: string[] = [];
	const lifecycle: LifecycleKind | undefined =
		action === "opened" ? "opened" : action === "reopened" ? "reopened" : closing ? "closed" : undefined;
	if (lifecycle) {
		// A post made by this very delivery has no line yet; otherwise a redelivery must not repeat the last one. When
		// the de-duplication kept an older post, that one may have its line already.
		const fresh = ensured.created && deduped === 0 && lifecycle === "opened";
		const repeat =
			!fresh && lastLifecycleKind(await notifications.readDiscussionMessages(channel.name, key)) === lifecycle;
		if (!repeat) {
			await notifications.postDiscussionMessage(channel.name, key, renderLifecycleLine(lifecycle, snapshot), {
				quiet: true,
			});
			posted.push(lifecycle);
		}
	}

	if (trigger.kind === "check_run") {
		const { check } = trigger;
		const conclusion = check.conclusion as CiVerdict["conclusion"];
		const marker = ciMessageMarker(check.headSha, conclusion);
		const messages = await notifications.readDiscussionMessages(channel.name, key);
		if (!messages.some((m) => m.split("\n").includes(marker))) {
			// The aggregate only says that something failed; the checks that did are on the commit it ran on.
			const runs =
				conclusion === "success"
					? []
					: snapshot.headSha === check.headSha
						? snapshot.checkRuns
						: await client.checks.listCheckRunsForRef(repo, check.headSha);
			const failed = runs
				.filter((c) => c.name !== SENTINEL_PR_FEED_CHECK_NAME && c.conclusion && FAILED.has(c.conclusion))
				.map((c) => ({ name: c.name, url: c.details_url ?? c.html_url }));
			const content = renderCiMessage({
				repo,
				sha: check.headSha,
				conclusion,
				runUrl: check.detailsUrl ?? check.url,
				...(check.detailsUrl ? { summaryUrl: check.url } : {}),
				failed,
			});
			// A failure is posted out loud so the people following the thread are told; a pass is not worth a ping.
			await notifications.postDiscussionMessage(channel.name, key, content, { quiet: conclusion === "success" });
			posted.push("ci");
		}
	}

	// Last, so the line above is written to a post that can still be written to.
	if (closing) await notifications.updateDiscussion(channel.name, key, { closed: true });

	return { number, outcome: ensured.created ? "created" : "updated", posted };
}
