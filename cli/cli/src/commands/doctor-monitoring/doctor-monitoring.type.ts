import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { WorkspaceMonitoring } from "../workspace-monitoring/index.js";

export interface RunDoctorMonitoringInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	loader?: PluginLoader;
	/** What the workspace packages' configs declare. Defaults to `readWorkspaceMonitoring()` over `context`. */
	workspaceMonitoring?: WorkspaceMonitoring;
	print?: (line: string) => void;
	logger?: Logger;
}

export interface DoctorMonitoringReport {
	/** `fail` if any row failed, `skip` if every row was skipped, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why every row was skipped, when they were. */
	reason?: string;
}
