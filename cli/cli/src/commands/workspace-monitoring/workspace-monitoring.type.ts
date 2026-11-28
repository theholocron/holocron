import type { MonitoringCheckInput, MonitoringDashboardInput, MonitoringStatusPageInput } from "../../plugin/index.js";

/** What the workspace packages' own configs declare to the `monitoring` provider. */
export interface WorkspaceMonitoring {
	/** The checks the packages declare (a check stays with the service that owns its hostname). */
	checks: MonitoringCheckInput[];
	/** The dashboards the packages declare. */
	dashboards: MonitoringDashboardInput[];
	/** The status pages the packages declare. */
	statusPages: MonitoringStatusPageInput[];
	/** Packages whose declarations could not be read, each as `<path>: <why>`; what they declare is unknown. */
	unreadable: string[];
}
