import type { NotificationsLayout } from "@theholocron/cli";

import type { PrFeedChannel } from "./pr-feed-channel.type.js";

/**
 * The forum the layout gives a `feeds.prs`, with what it leaves out; `undefined` when no channel has one (the feed is
 * not set up). The first such forum wins: one feed per server.
 */
export function prFeedChannel(layout: NotificationsLayout | undefined): PrFeedChannel | undefined {
	for (const category of layout?.categories ?? []) {
		for (const channel of category.channels ?? []) {
			const feed = channel.feeds?.prs;
			if (channel.kind !== "forum" || !feed) continue;
			const exclude = feed === true ? undefined : feed.exclude;
			return { name: channel.name, excludeRepos: exclude?.repos ?? [], excludeAuthors: exclude?.authors ?? [] };
		}
	}
	return undefined;
}
