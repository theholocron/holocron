import type { Logger } from "@theholocron/observability/core";

import type { GlobalArgs } from "../../cli-support/index.js";
import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { CheckRow, CheckStatus, CheckSummary } from "../doctor-checks/index.js";
import type { TemplatesIo } from "../project/load-templates/index.js";

export interface RunDoctorProjectInput {
	/** The loaded config: `providers.projects` and its `boards`. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	/** Post the result to this channel as the `notifications` provider's bot once the run is done: the failures, or the summary. */
	post?: string;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Where the template files are read from. Defaults to the real file system. */
	io?: TemplatesIo;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorProjectReport {
	/** `fail` if any row failed, `skip` if nothing could be checked, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was checked, when that is so. */
	reason?: string;
}

/** The flags of `doctor project`. */
export interface DoctorProjectArgs extends GlobalArgs {
	post?: string;
}
