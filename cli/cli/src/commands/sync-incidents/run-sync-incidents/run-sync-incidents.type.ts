import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { IncidentFeedPlan } from "../../plan-incident-feed/index.js";

/** What {@link runSyncIncidents} needs. */
export interface RunSyncIncidentsInput {
	/** The repo's config. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads Checkly and the forum and writes nothing. */
	context: RuntimeContext;
	/** Only incidents still open or resolved since this ISO time are read. Defaults to two days back. */
	since?: string;
	/** Make the posts without asking (a scheduled run needs it). */
	yes?: boolean;
	/** The `notifications` provider to use, when several are configured. */
	provider?: string;
	/** Builds the loader; tests pass one. */
	loader?: PluginLoader;
	/** The moment `since` counts back from; tests pass one. */
	now?: Date;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How a run went, one count per way an incident can end up. */
export interface SyncIncidentsCounts {
	/** Posts made. */
	created: number;
	/** Existing posts changed (summary, tag, an update appended, closed or opened again). */
	updated: number;
	/** Incidents whose post was already in step. */
	unchanged: number;
	/** Incidents whose post could not be written (a failing row each). */
	failed: number;
	/** Incidents not reached because Discord rate limited the run; the next run continues. */
	left: number;
}

/** What a run did. */
export interface SyncIncidentsReport {
	/** `skip` when it is not configured, `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** The counts of the run, once the incidents were read. */
	counts?: SyncIncidentsCounts;
	/** The plan for each incident that was read, in the order Checkly returned them. */
	plans?: IncidentFeedPlan[];
	/** Why it did not run, when that is so. */
	reason?: string;
}
