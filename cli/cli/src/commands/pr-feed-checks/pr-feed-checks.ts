import { sanitizeDetail } from "@theholocron/kyber/ui";

import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { resultRow, skipRow } from "../notification-check-rows/index.js";
import { PR_FEED_TAGS } from "../notifications-setup/index.js";
import type { PrFeedChecksInput } from "./pr-feed-checks.type.js";

const FORUM_TITLE = "pull request feed forum exists";
const TAGS_TITLE = "pull request feed forum has the tags of every state";
const BOT_TITLE = "bot can post in the pull request feed forum and manage its threads";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const shown = (s: string) => sanitizeDetail(s);

/**
 * The steps of `doctor notifications` for the pull-request feed (`feeds.prs`): the forum is there (in its category, as a
 * forum), it holds a tag for every state a pull request's post can be in, and the bot can start posts and manage their
 * threads in it (read from `inspect`, after the channel's own overwrites). Read-only. No rows when no channel has
 * `feeds.prs`.
 */
export function prFeedChecks(input: PrFeedChecksInput): NotificationsCheck[] {
	const { layout, found } = input;
	const fed = (layout.categories ?? [])
		.flatMap((cat) => (cat.channels ?? []).map((channel) => ({ cat: cat.name, channel })))
		.filter(({ channel }) => channel.feeds?.prs);
	if (fed.length === 0) return [];
	if (!found) {
		const reason = "not checked: could not read the server";
		return [
			skipRow("pr-feed-forum", FORUM_TITLE, reason),
			skipRow("pr-feed-tags", TAGS_TITLE, reason),
			skipRow("pr-feed-bot", BOT_TITLE, reason),
		];
	}
	const forumProblems: string[] = [];
	const tagProblems: string[] = [];
	const botProblems: string[] = [];
	for (const { cat, channel } of fed) {
		const name = shown(channel.name);
		const have = found.channels.find(
			(c) => same(c.name, channel.name) && c.category !== undefined && same(c.category, cat)
		);
		if (!have) {
			forumProblems.push(`#${name}: missing from ${shown(cat)}`);
			continue;
		}
		if (have.kind !== "forum") {
			forumProblems.push(`#${name}: is a text channel, not a forum; delete it so \`setup\` can make it again`);
			continue;
		}
		for (const tag of PR_FEED_TAGS) {
			if (!have.tags?.some((t) => same(t.name, tag))) tagProblems.push(`#${name}: tag "${tag}" is missing`);
		}
		if (have.botThreadsError) {
			botProblems.push(`#${name}: could not read the bot's permissions (${shown(have.botThreadsError)})`);
		} else if (have.botThreads) {
			if (!have.botThreads.post) botProblems.push(`#${name}: the bot cannot start posts or reply in it`);
			if (!have.botThreads.manage) {
				botProblems.push(`#${name}: the bot cannot manage threads in it (Manage Threads)`);
			}
		} else {
			botProblems.push(`#${name}: the provider did not report the bot's permissions`);
		}
	}
	const ok = `${fed.length} of ${fed.length} as declared`;
	return [
		resultRow("pr-feed-forum", FORUM_TITLE, forumProblems, ok),
		resultRow("pr-feed-tags", TAGS_TITLE, tagProblems, ok),
		resultRow("pr-feed-bot", BOT_TITLE, botProblems, ok),
	];
}
