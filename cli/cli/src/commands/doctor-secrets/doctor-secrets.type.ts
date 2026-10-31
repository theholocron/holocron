import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { CheckRow, CheckStatus, CheckSummary } from "../doctor-checks/index.js";

export interface RunDoctorSecretsInput {
	/** The loaded config: `repo.secrets`, the tasks and the notification layouts say which secrets must exist. */
	loaded: LoadedConfig;
	/** The runtime context; `org` says where the organization's secrets live. */
	context: RuntimeContext;
	loader?: PluginLoader;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorSecretsReport {
	/** `fail` if any row failed, `skip` if every row was skipped, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why every row was skipped, when they were. */
	reason?: string;
}

/** The secret names the config says must exist, by scope. */
export interface ExpectedSecrets {
	/** Repository secrets. */
	repo: string[];
	/** Organization secrets. */
	org: string[];
	/** Environment secrets, by environment name. */
	environments: Record<string, string[]>;
}
