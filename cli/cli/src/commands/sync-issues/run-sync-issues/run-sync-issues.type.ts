import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext, SyncResult } from "../../../plugin/index.js";
import type { DroppedTally } from "../../migrate/tally-dropped/index.js";

/** What {@link runSyncIssues} needs. */
export interface RunSyncIssuesInput {
	/** The repo's config. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads both sides and changes neither. */
	context: RuntimeContext;
	/** The source, as `provider` or `provider:key=value,...`. Nothing is ever written to it. */
	from: string;
	/** The target, in the same form. */
	to: string;
	/** Only issues last changed after this moment, as an ISO timestamp (see `parseSince`). */
	since?: string;
	/** Sync without asking. */
	yes?: boolean;
	/** Builds a loader for a side; tests pass one. */
	makeLoader?: (resolved: LoadedConfig["resolved"], context: RuntimeContext) => PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How a sync went, one count per way an issue can end up. */
export interface SyncCounts {
	/** Issues made on the target (on a dry run, that would be). */
	created: number;
	/** Issues the target already had that were changed. */
	updated: number;
	/** Issues the target already had that already matched. */
	unchanged: number;
	/** Source issues skipped because they carry an address from another tracker (the loop guard). */
	guarded: number;
	/** Issues not reached because the provider rate limited the run; the next run continues with them. */
	left: number;
}

/** What a sync did. */
export interface SyncIssuesReport {
	/** `skip` when a provider cannot export or sync, `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** One result per issue the target reached, in source order. */
	results?: SyncResult[];
	/** The counts of the run. */
	counts?: SyncCounts;
	/** What the target could not hold, with how many issues lost it. */
	notCarried?: DroppedTally[];
	/** Why it did not run, when that is so. */
	reason?: string;
}
