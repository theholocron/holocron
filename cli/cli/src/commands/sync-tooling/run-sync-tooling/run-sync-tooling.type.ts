import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What {@link runSyncTooling} needs. */
export interface RunSyncToolingInput {
	/** The repo's config: its `tooling` providers, and the `credentials` provider their tokens may come from. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` names what each provider would sync and calls none. */
	context: RuntimeContext;
	/** Defaults to a loader over the config's `tooling` and `credentials` providers only. */
	loader?: PluginLoader;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How a `sync tooling` run went. */
export interface SyncToolingReport {
	/** `fail` if a row failed, otherwise `ok`. */
	status: "ok" | "fail";
	/** One row per `tooling` provider (or one row for the run when it could not start). */
	rows: CheckRow[];
}
