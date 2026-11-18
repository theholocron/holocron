import type { Monitoring, MonitoringCheckInput } from "../../../plugin/index.js";
import type { WorkspaceMonitoring } from "../../workspace-monitoring/index.js";

export interface UndeclaredCheckRowsInput {
	/** The root config's `monitoring` provider. */
	monitoring: Monitoring;
	/** What the workspace packages' configs declare. */
	workspace: WorkspaceMonitoring;
	/** The checks the account holds, from the read the checks row made; `undefined` when that read failed or is not offered. */
	have: readonly MonitoringCheckInput[] | undefined;
}
