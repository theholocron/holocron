import type { CheckRow, CheckStatus, CheckSummary } from "@theholocron/kyber/ui";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";

export interface RunDoctorVariableOwnersInput {
	/** The loaded config: the Environments it names, the sync entries and `doctor.sharedVariables`. */
	loaded: LoadedConfig;
	/** The runtime context; `org` says where the organization's secrets and variables live. */
	context: RuntimeContext;
	/** Lists the Environments' names. Defaults to a loader that does not read the credentials providers' values. */
	loader?: PluginLoader;
	/** Provides the `secrets` and `source` providers that list GitHub names. Defaults to a loader that reads the credentials. */
	githubLoader?: PluginLoader;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

export interface DoctorVariableOwnersReport {
	/** `fail` if a name lives in more than one place, `skip` if nothing could be compared, otherwise `ok`. */
	status: CheckStatus;
	rows: CheckRow[];
	summary: CheckSummary;
	/** Why nothing was compared, when that is so. */
	reason?: string;
}

/** The variable names one place holds. Never a value. */
export interface NameSource {
	/** How a row names the place, e.g. `1Password Environment "Sentinel"` or `organization secrets`. */
	label: string;
	/** Places with the same group are one place for the comparison (the instances of one GitHub App). */
	group: string;
	/** The names it holds. */
	names: string[];
	/** For a GitHub place a `repo.*.sync` entry can fill: the feed key (see {@link SyncFeed}). */
	feed?: string;
	/** For a 1Password Environment, its name. */
	environment?: string;
}

/** One `repo.secrets.sync` or `repo.variables.sync` entry: an Environment that fills a GitHub place. */
export interface SyncFeed {
	/** The vault Environment. */
	environment: string;
	/** The GitHub place it fills, as `feedKey()` spells it. */
	target: string;
	/** The names it fills; absent for a secrets entry that fills every key the Environment holds. */
	keys?: string[];
}

/** A name held by more than one place, and the places. */
export interface NameHolders {
	/** The name as the first place spells it. */
	name: string;
	/** The places holding it. */
	places: NameSource[];
}
