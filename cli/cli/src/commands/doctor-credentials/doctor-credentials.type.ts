import type { GitExec } from "@theholocron/git-utils";
import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";

export interface RunDoctorCredentialsInput {
	/** The loaded config: `credentials.environment` and the `credentials` providers, and the plugins whose tokens are expected. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	/** Defaults to a loader that does not read the providers' values. */
	loader?: PluginLoader;
	/** Loads a plugin package for its `tokens`. Defaults to resolving from the working directory. */
	importer?: AuthImporter;
	/** The process environment that picks the layer of a derived Environment name. Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** Replaces the `git` call that reads the repo's `origin`, for tests. */
	gitExec?: GitExec;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorCredentialsReport {
	/** `fail` if a provider cannot find the environment or it lacks an expected variable (rows are per variable), `skip` if nothing could be checked, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was checked, when that is so. */
	reason?: string;
}
