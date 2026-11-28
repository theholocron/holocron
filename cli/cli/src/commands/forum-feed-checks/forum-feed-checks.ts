import { sanitizeDetail } from "@theholocron/kyber/ui";

import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { resultRow, skipRow } from "../notification-check-rows/index.js";
import type { ForumFeedChecksInput, ForumFeedSpec } from "./forum-feed-checks.type.js";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const shown = (s: string) => sanitizeDetail(s);

/**
 * The steps of `doctor notifications` for a forum feed (`feeds.prs`, `feeds.incidents`): the forum is there (in its
 * category, as a forum), it holds a tag for every state a post can be in, and the bot can start posts and manage their
 * threads in it (read from `inspect`, after the channel's own overwrites). Read-only. No rows when no channel has the
 * feed.
 */
export function forumFeedChecks(input: ForumFeedChecksInput, spec: ForumFeedSpec): NotificationsCheck[] {
	const { layout, found } = input;
	const forumTitle = `${spec.label} forum exists`;
	const tagsTitle = `${spec.label} forum has the tags of every state`;
	const botTitle = `bot can post in the ${spec.label} forum and manage its threads`;
	const fed = (layout.categories ?? [])
		.flatMap((cat) => (cat.channels ?? []).map((channel) => ({ cat: cat.name, channel })))
		.filter(({ channel }) => channel.feeds?.[spec.feed]);
	if (fed.length === 0) return [];
	if (!found) {
		const reason = "not checked: could not read the server";
		return [
			skipRow(spec.ids.forum, forumTitle, reason),
			skipRow(spec.ids.tags, tagsTitle, reason),
			skipRow(spec.ids.bot, botTitle, reason),
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
		for (const tag of spec.tags) {
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
		resultRow(spec.ids.forum, forumTitle, forumProblems, ok),
		resultRow(spec.ids.tags, tagsTitle, tagProblems, ok),
		resultRow(spec.ids.bot, botTitle, botProblems, ok),
	];
}
