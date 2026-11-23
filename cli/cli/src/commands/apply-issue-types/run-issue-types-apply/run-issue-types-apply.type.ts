import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";
import type { EnsureIssueTypesReport } from "../../issue-types/index.js";

/** What {@link runIssueTypesApply} needs. */
export interface RunIssueTypesApplyInput {
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads the Types and prints what would change. */
	context: RuntimeContext;
	/** Also set `description` and `color` on an existing Type that differs. */
	update?: boolean;
	/** Write without asking. */
	yes?: boolean;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** What the command did: the report of `ensureIssueTypes()`. */
export type IssueTypesApplyReport = EnsureIssueTypesReport;
