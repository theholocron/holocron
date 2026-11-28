import type { DiscussionPost, MonitoringIncident, MonitoringIncidentUpdate } from "../../plugin/index.js";
import type { RenderedIncident } from "../render-incident/index.js";

export interface PlanIncidentFeedInput {
	incident: MonitoringIncident;
	/** The incident as its post should read now. */
	rendered: RenderedIncident;
	/** The incident's post as it is now, or undefined when it has none. */
	post: DiscussionPost | undefined;
	/** The post's messages, newest first, the first message (with its footer) last; empty when there is no post. */
	messages: readonly string[];
}

/** What one run does for one incident. */
export interface IncidentFeedPlan {
	/** The incident's id. */
	id: string;
	/** Make the post (quietly) with the summary as its first message. */
	create: boolean;
	/** Rewrite the summary, title and tag of an existing post. */
	rewrite: boolean;
	/** The updates not yet posted, oldest first; each is appended as one message. */
	append: MonitoringIncidentUpdate[];
	/** The tag the post should carry, when it does not carry it now. */
	retag?: string;
	/** Close the post (true) or open it again (false), when it is not as it should be. */
	close?: boolean;
	/** Short phrases for a dry run: `create post`, `append update <id>`, `retag <tag>`, `close`, `reopen`, `rewrite summary`. */
	steps: string[];
}
