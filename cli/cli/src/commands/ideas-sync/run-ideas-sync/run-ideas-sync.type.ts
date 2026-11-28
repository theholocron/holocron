import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What {@link runIdeasSync} needs. */
export interface RunIdeasSyncInput {
	/** The repo's config: its `ideas` and `issues` providers (or the legacy `ideas` block) and its `ideas.states`. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads the notes and changes nothing. */
	context: RuntimeContext;
	/** File without asking. */
	yes?: boolean;
	/** Variables for `HOLOCRON_IDEAS_DIR`, when the config names no provider. Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** Loads the `ideas` provider alone, to read. Defaults to a loader over the config's `ideas` entry. */
	ideasLoader?: PluginLoader;
	/** Defaults to a loader over the config; it is built only when there is something to file. */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How an `sync ideas` run went. */
export interface IdeasSyncReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** One row per idea (or one row for the run when it could not start). */
	rows: CheckRow[];
}
