import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";

export interface RunDoctorWorkersInput {
	/** The loaded config: `providers.workers`, `providers.deployment` and what declares Workers. */
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

export interface DoctorWorkersReport {
	/** `fail` if any row failed, `skip` if no row passed, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was checked, when that is the case. */
	reason?: string;
}

/** A Worker the config makes setup deploy. */
export interface DeclaredWorker {
	/** What it is for, for the row titles: `relay`, `wiki proxy`. */
	label: string;
	/** Its script name at the provider, or undefined when the provider does not say how it names it. */
	script: string | undefined;
	/** The hostname it serves (its route is `<host>/*`). */
	host: string;
	/** The binding names (never values) it must have. */
	bindings: string[];
}

/** A deployment project the config makes setup create. */
export interface DeclaredProject {
	/** The project's name. */
	project: string;
	/** The custom domain attached to it, when one is declared. */
	hostname?: string;
}
