import type { LoadedConfig } from "../../../config/index.js";
import type { MonitoringIncidentStatus, PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What {@link runUpdateIncident} needs. */
export interface RunUpdateIncidentInput {
	/** `update` appends an update with a status of the caller's choice; `close` appends a `resolved` one. */
	mode: "update" | "close";
	/** The provider's id for the incident, as `new incident` printed it. */
	id: string;
	/** The repo's config. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads the incident and writes nothing. */
	context: RuntimeContext;
	/** The declared status page, when several are declared. */
	page?: string;
	/** The status the update puts the incident in; `update` needs it, `close` ignores it. */
	status?: Exclude<MonitoringIncidentStatus, "resolved">;
	/** What the update says; `update` needs it, `close` has a default. */
	message?: string;
	/** Tell the page's subscribers. Defaults to true. */
	notify?: boolean;
	/** Write without asking (a workflow needs it). */
	yes?: boolean;
	/** Builds the loader; tests pass one. */
	loader?: PluginLoader;
	/** The moment the lookback for the incident counts from; tests pass one. */
	now?: Date;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** What a run did. */
export interface RunUpdateIncidentReport {
	/** `skip` when there was nothing to write (the update is already there), `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** Why it did not write, when that is so. */
	reason?: string;
}
