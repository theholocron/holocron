import type { NotificationsCheck } from "../doctor-notifications/doctor-notifications.type.js";
import { forumFeedChecks } from "../forum-feed-checks/index.js";
import { INCIDENT_FEED_TAGS } from "../notifications-setup/index.js";
import type { IncidentFeedChecksInput } from "./incident-feed-checks.type.js";

/**
 * The steps of `doctor notifications` for the status page incident feed (`feeds.incidents`): the forum is there, it holds
 * a tag for every state an incident's post can be in, and the bot can start posts and manage their threads in it.
 * Read-only. No rows when no channel has `feeds.incidents`.
 */
export function incidentFeedChecks(input: IncidentFeedChecksInput): NotificationsCheck[] {
	return forumFeedChecks(input, {
		feed: "incidents",
		ids: { forum: "incident-feed-forum", tags: "incident-feed-tags", bot: "incident-feed-bot" },
		label: "incident feed",
		tags: INCIDENT_FEED_TAGS,
	});
}
