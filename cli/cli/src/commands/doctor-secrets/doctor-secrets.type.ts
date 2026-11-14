import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext, SecretScope } from "../../plugin/index.js";

/** An environment `doctor secrets --env` can be asked about. */
export type DoctorEnvironment = "local" | "dev" | "ci" | "test" | "prod";

export interface RunDoctorSecretsInput {
	/** The loaded config: `repo.secrets`, the tasks and the notification layouts say which secrets must exist. */
	loaded: LoadedConfig;
	/** The runtime context; `org` says where the organization's secrets live. */
	context: RuntimeContext;
	loader?: PluginLoader;
	/**
	 * The environments to check. Omit it to run every environment the config declares: `ci` (the GitHub secrets
	 * `repo.secrets.sync` fills) and `prod` (the `repo.secrets.deploy` destinations). An environment named here that this
	 * command does not cover yet (`local`, `dev`) or that has no layer (`test`) is a skipped row.
	 */
	environments?: readonly DoctorEnvironment[];
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

/** What `repo.secrets.sync` adds to the expected secrets. */
export interface SyncedSecrets {
	/** The names expected at each scope, and for an organization entry the repositories (by name) that may read them. */
	scopes: Array<{ scope: SecretScope; names: string[]; repos?: string[] }>;
	/** A row for each entry that could not be resolved. */
	rows: CheckRow[];
}
