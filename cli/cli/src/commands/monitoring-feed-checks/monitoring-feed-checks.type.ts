import type { Monitoring, NotificationsLayout, ServerInspection } from "../../plugin/index.js";

export interface MonitoringFeedChecksInput {
	layout: NotificationsLayout;
	/** The configured `monitoring` provider, or undefined when there is none. */
	monitoring: Pick<Monitoring, "providerName" | "icon" | "inspectAlertChannel"> | undefined;
	/** Why there is no `monitoring` provider (it failed to load, or is not configured): the reason the rows skip. */
	missingReason: string;
	/** The server as `inspect` read it, or undefined when it could not be read. */
	found: ServerInspection | undefined;
}
