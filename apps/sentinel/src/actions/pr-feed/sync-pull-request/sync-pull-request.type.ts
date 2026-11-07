import type { GitHubClient } from "@theholocron/github-client";

import type { RoleNotifications } from "../../role-sync/index.js";
import type { PrFeedTrigger } from "../pr-feed.type.js";
import type { PrFeedChannel } from "../pr-feed-channel/index.js";

export interface SyncPullRequestInput {
	client: GitHubClient;
	notifications: RoleNotifications;
	channel: PrFeedChannel;
	/** `owner/repo`. */
	repo: string;
	number: number;
	trigger: PrFeedTrigger;
	now: Date;
}

/** What the feed did for one pull request. */
export interface PrFeedPullResult {
	number: number;
	/** `created` or `updated` its post, or `skipped` it (see `reason`). */
	outcome: "created" | "updated" | "skipped";
	/** Why it was skipped. */
	reason?: string;
	/** The messages appended to its thread: `opened`, `reopened`, `closed` and `ci`. */
	posted: string[];
}
