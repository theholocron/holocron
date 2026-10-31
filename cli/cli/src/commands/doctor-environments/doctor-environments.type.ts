import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { CheckRow, CheckStatus, CheckSummary } from "../doctor-checks/index.js";

export interface RunDoctorEnvironmentsInput {
	/** The loaded config: `repo.secrets.environments` names environments that must exist besides the ones setup creates. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	loader?: PluginLoader;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorEnvironmentsReport {
	/** `fail` if the check failed, `skip` if it could not run, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why the check was skipped, when it was. */
	reason?: string;
}
