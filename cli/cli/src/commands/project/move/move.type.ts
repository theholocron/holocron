import type { LoadedConfig } from "../../../config/index.js";
import type { MoveReport, PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { TemplatesIo } from "../load-templates/index.js";

export interface RunProjectMoveInput {
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` previews instead of moving. */
	context: RuntimeContext;
	/** The name of the board the items leave (it may be closed). */
	from: string;
	/** The name of the open board they go to. */
	to: string;
	/** The template that reads the boards' statuses. Defaults to the one `to` (else `from`) is declared with, else `roadmap`. */
	template?: string;
	/** Move without asking. */
	yes?: boolean;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Where the template files are read from. Defaults to the real file system. */
	io?: TemplatesIo;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

export interface ProjectMoveReport {
	/** `skip` when the provider cannot move or there is no provider, `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** What the provider reported, or, on a dry run, what it would do. */
	moved?: MoveReport;
	/** Why it did not run, when that is so. */
	reason?: string;
}
