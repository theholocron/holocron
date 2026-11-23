import type { NotificationsLayout, ServerInspection } from "../../plugin/index.js";

/** What differs between the forum feeds `doctor notifications` checks the same way. */
export interface ForumFeedSpec {
	/** The `feeds` key that marks a forum as carrying the feed. */
	feed: "prs" | "incidents";
	/** The row ids: the forum, its tags and the bot. */
	ids: { forum: string; tags: string; bot: string };
	/** What the feed's posts are, for the row titles (`pull request feed`). */
	label: string;
	/** The tag of every state a post can be in (lower case). */
	tags: readonly string[];
}

export interface ForumFeedChecksInput {
	layout: NotificationsLayout;
	/** The server as `inspect` read it, or undefined when it could not be read. */
	found: ServerInspection | undefined;
}
