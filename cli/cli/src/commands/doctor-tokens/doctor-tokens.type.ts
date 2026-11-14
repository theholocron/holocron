import type { GitExec } from "@theholocron/git-utils";
import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { PluginToken } from "../auth/index.js";

export interface RunDoctorTokensInput {
	/** The loaded config: its providers say which plugins to ask for tokens, its repo says which Environments. */
	loaded: LoadedConfig;
	/** The runtime context. */
	context: RuntimeContext;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Builds the loader again for a context with another token in it. Defaults to a loader over the config. */
	makeLoader?: (context: RuntimeContext) => PluginLoader;
	/** The tokens a provider's plugin lists; the real one imports the plugin package. */
	providerTokens?: (provider: string) => Promise<readonly PluginToken[]>;
	/** Reads the remote a layer word is resolved from; tests inject one. */
	gitExec?: GitExec;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorTokensReport {
	/** `fail` if any row failed, `skip` if no row passed, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was checked, when that is the case. */
	reason?: string;
}
