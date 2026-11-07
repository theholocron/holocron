import type { LoadedConfig } from "../../../config/index.js";
import type { ImportResult, PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { MigrateScope } from "../collect-records/index.js";
import type { DroppedTally } from "../tally-dropped/index.js";

/** What {@link runMigrate} needs. */
export interface RunMigrateInput {
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads both sides and changes neither. */
	context: RuntimeContext;
	/** The source, as `provider` or `provider:key=value,...`. */
	from: string;
	/** The target, in the same form. */
	to: string;
	/** What to move. */
	scope: MigrateScope;
	/** Leave closed issues behind. */
	openOnly?: boolean;
	/** Put every migrated issue in this milestone (GitHub) or project (Linear). A project scope defaults it to the board's name. */
	milestone?: string;
	/** Migrate without asking. */
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

/** What a migration did. */
export interface MigrateReport {
	/** `skip` when a provider cannot export or import, `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** One result per record, in order. */
	results?: ImportResult[];
	/** What the target could not hold, with how many issues lost it. */
	notCarried?: DroppedTally[];
	/** Why it did not run, when that is so. */
	reason?: string;
}
