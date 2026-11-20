import type { NotificationsLayout } from "../../plugin/index.js";
import { relayFeedWebhook } from "./relay-feed-webhook.js";
import type { GenericRelayFeed } from "./relay-sources.type.js";

/** Every `feeds.relay` entry of the layout that is switched on, in layout order. The error tracker's feed is not one. */
export function genericRelayFeeds(layout: NotificationsLayout): GenericRelayFeed[] {
	const feeds: GenericRelayFeed[] = [];
	for (const category of layout.categories ?? []) {
		for (const channel of category.channels ?? []) {
			for (const [source, feed] of Object.entries(channel.feeds?.relay ?? {})) {
				if (!feed) continue;
				feeds.push({ source, channel, feed, webhook: relayFeedWebhook(source, feed) });
			}
		}
	}
	return feeds;
}
