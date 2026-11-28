const capitalised = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

/** The name of a channel's dedicated webhook for a source: the feed's own, else the id, capitalised (`Vercel`). */
export function relayFeedWebhook(source: string, feed: true | { webhook?: string }): string {
	return (typeof feed === "object" ? feed.webhook : undefined) ?? capitalised(source);
}
