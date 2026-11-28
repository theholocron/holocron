import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { forumFeedChecks } from "../forum-feed-checks/index.js";
import { PR_FEED_TAGS } from "../notifications-setup/index.js";
import type { PrFeedChecksInput } from "./pr-feed-checks.type.js";

/**
 * The steps of `doctor notifications` for the pull-request feed (`feeds.prs`): the forum is there (in its category, as a
 * forum), it holds a tag for every state a pull request's post can be in, and the bot can start posts and manage their
 * threads in it (read from `inspect`, after the channel's own overwrites). Read-only. No rows when no channel has
 * `feeds.prs`.
 */
export function prFeedChecks(input: PrFeedChecksInput): NotificationsCheck[] {
	return forumFeedChecks(input, {
		feed: "prs",
		ids: { forum: "pr-feed-forum", tags: "pr-feed-tags", bot: "pr-feed-bot" },
		label: "pull request feed",
		tags: PR_FEED_TAGS,
	});
}
