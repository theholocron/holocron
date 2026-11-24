import type { LoadedConfig } from "../../../config/index.js";
import type { MonitoringIncidentStatus, PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What {@link runNewIncident} needs. */
export interface RunNewIncidentInput {
	/** The incident's name. */
	title: string;
	/** The repo's config. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads the page and writes nothing. */
	context: RuntimeContext;
	/** The declared status page, when several are declared. */
	page?: string;
	/** The status the opening update carries. Defaults to `investigating`. */
	status?: Exclude<MonitoringIncidentStatus, "resolved">;
	/** The `<component>=<impact>` pairs to mark. */
	components?: string[];
	/** What the opening update says. Defaults to a line for the status. */
	message?: string;
	/** Tell the page's subscribers. Defaults to true. */
	notify?: boolean;
	/** Open the incident even when an open one has the same title. */
	allowDuplicate?: boolean;
	/** Open it without asking (a workflow needs it). */
	yes?: boolean;
	/** Builds the loader; tests pass one. */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** What a run did. */
export interface RunNewIncidentReport {
	/** `skip` when nothing could be done and nothing was asked, `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** The provider's id for the incident that was opened, for `update incident` and `close incident`. */
	id?: string;
	/** Why it did not open one, when that is so. */
	reason?: string;
}
