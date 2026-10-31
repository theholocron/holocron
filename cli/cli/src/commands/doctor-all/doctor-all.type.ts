import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { RuntimeContext } from "../../plugin/index.js";
import type { DeepCheck } from "../deep-checks/index.js";
import type { CheckRow, CheckStatus, CheckSummary } from "../doctor-checks/index.js";

export interface RunDoctorAllInput {
	/** The loaded config, handed to every check. */
	loaded: LoadedConfig;
	/** The runtime context (tokens, org, repo), handed to every check. */
	context: RuntimeContext;
	/** The checks to run, in order. Defaults to every entry in `DEEP_CHECKS`. */
	checks?: readonly DeepCheck[];
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink, also handed to every check. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorAllReport {
	/** `fail` if any check failed, `skip` if none ran, otherwise `ok`. */
	status: CheckStatus;
	/** One row per check, in the order they ran. */
	rows: CheckRow[];
	/** Counts of checks, not of the steps inside them. */
	summary: CheckSummary;
}
