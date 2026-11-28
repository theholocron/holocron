import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";

export interface RunDoctorLogsInput {
	/** The loaded config: `providers.logs`, `log.axiom.dataset` and `dev.serve.logging`. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorLogsReport {
	/** `fail` if any row failed, `skip` if no row passed, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was checked, when that is the case. */
	reason?: string;
}

/** One service that ships logs to its own dataset (ADR-0019). */
export interface LogsDatasetTarget {
	/** Short id used in the row ids: `cli`, `sentinel`. */
	id: string;
	/** What the dataset belongs to, for the row title. */
	label: string;
	/** The variable that names the dataset; only the name is ever printed. */
	variable: string;
	/** The dataset name, or `undefined` when nothing resolves it here. */
	name: string | undefined;
	/** What to do when the dataset is missing. */
	fix: string;
}
