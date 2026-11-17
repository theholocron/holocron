import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext, ToolingWorkspaceSide } from "../../../plugin/index.js";

/** What {@link runSyncRequests} needs. */
export interface RunSyncRequestsInput {
	/** The repo's config: its `tooling` providers and their `collectionFiles` / `envFiles` options. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` compares and lists, and writes nothing. */
	context: RuntimeContext;
	/** Sync only for this provider. */
	to?: string;
	/** Compare only, and fail when any file is out of date or in conflict. Never writes and never asks. */
	check?: boolean;
	/** Settles a pair whose two sides both changed for this run: `source` or `workspace`. Without it a conflict fails the row and writes nothing. */
	prefer?: ToolingWorkspaceSide;
	/** Write without asking. */
	yes?: boolean;
	/** Loads the `tooling` providers alone. Defaults to a loader over the config's `tooling` entry. */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How a `sync requests` run went. */
export interface SyncRequestsReport {
	/** `fail` if a row failed (or, with `check`, a file is out of date), `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** One row per provider (or one row for the run when it could not start). */
	rows: CheckRow[];
}
