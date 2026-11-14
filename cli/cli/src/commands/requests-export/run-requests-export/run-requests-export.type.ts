import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What {@link runRequestsExport} needs. */
export interface RunRequestsExportInput {
	/** The repo's config: its `tooling` providers and their `collectionFiles` / `envFiles` options. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` converts the files and writes nothing. */
	context: RuntimeContext;
	/** Export only for this provider. */
	to?: string;
	/** The folder to write under, one folder per provider. Defaults to `.export` beside the first collection file. */
	out?: string;
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

/** How an `export requests` run went. */
export interface RequestsExportReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** One row per provider (or one row for the run when it could not start). */
	rows: CheckRow[];
}
