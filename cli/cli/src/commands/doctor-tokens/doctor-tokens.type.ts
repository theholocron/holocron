import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { AuthImporter } from "../auth/index.js";

export interface RunDoctorTokensInput {
	/** The loaded config: its providers say which plugins to ask for their tokens. */
	loaded: LoadedConfig;
	/** The runtime context: its `repoRoot` is where the repo's `.env` is read from. */
	context: RuntimeContext;
	/**
	 * Loads the repo's `.env` and the config's `credentials` providers into the credential store, the step every command
	 * runs first, so a token is found where the plugins find it. Defaults to a loader over the config.
	 */
	loader?: Pick<PluginLoader, "load" | "loadFailures">;
	/** Loads a plugin package for its `tokens` and `verifyToken`. Defaults to resolving from the working directory. */
	importer?: AuthImporter;
	/** Environment to look tokens up in. Defaults to the process environment. */
	env?: NodeJS.ProcessEnv;
	/** Reads a keyring entry, or null. Defaults to the OS keyring. */
	keyring?: (key: string) => string | null;
	/** The current time, for how long a token has left. Defaults to the clock; tests pass a fixed one. */
	now?: () => Date;
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
