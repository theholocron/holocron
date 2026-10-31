import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { RuntimeContext } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";
import type { CheckRow, CheckStatus, CheckSummary } from "../doctor-checks/index.js";

export interface RunDoctorTokensInput {
	/** The loaded config: its providers say which plugins to ask for their tokens. */
	loaded: LoadedConfig;
	/** The runtime context. Not used to find tokens; kept so the check has the same input as the others. */
	context: RuntimeContext;
	/** Loads a plugin package for its `tokens` and `verifyToken`. Defaults to resolving from the working directory. */
	importer?: AuthImporter;
	/** Environment to look tokens up in. Defaults to the process environment. */
	env?: NodeJS.ProcessEnv;
	/** Reads a keyring entry, or null. Defaults to the OS keyring. */
	keyring?: (key: string) => string | null;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorTokensReport {
	/** `fail` if any token was rejected, `skip` if nothing could be checked, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was checked, when that is so. */
	reason?: string;
}
