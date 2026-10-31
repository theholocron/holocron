import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { CheckRow, CheckStatus, CheckSummary } from "../doctor-checks/index.js";

export interface RunDoctorMonitoringInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	loader?: PluginLoader;
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
