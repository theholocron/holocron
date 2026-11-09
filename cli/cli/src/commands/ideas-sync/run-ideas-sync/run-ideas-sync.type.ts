import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { IdeasIo } from "../ideas-sync.type.js";

/** What {@link runIdeasSync} needs. */
export interface RunIdeasSyncInput {
	/** The repo's config: its `ideas` block and its `issues` provider. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads the notes and changes nothing. */
	context: RuntimeContext;
	/** File without asking. */
	yes?: boolean;
	/** The disk. Defaults to the real one. */
	io?: IdeasIo;
	/** Variables for `HOLOCRON_IDEAS_DIR`. Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** Defaults to a loader over the config; it is built only when there is something to file. */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How an `ideas sync` run went. */
export interface IdeasSyncReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** One row per note (or one row for the run when it could not start). */
	rows: CheckRow[];
}
