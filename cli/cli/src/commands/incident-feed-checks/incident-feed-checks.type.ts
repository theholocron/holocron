import type { NotificationsLayout, ServerInspection } from "../../plugin/index.js";

export interface IncidentFeedChecksInput {
	layout: NotificationsLayout;
	/** The server as `inspect` read it, or undefined when it could not be read. */
	found: ServerInspection | undefined;
}
