import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../../plugin/index.js";

/** What {@link runPropertiesApply} needs. */
export interface RunPropertiesApplyInput {
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` reads the property and prints what would be added. */
	context: RuntimeContext;
	/** Add without asking. */
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

/** What the command did. */
export interface PropertiesApplyReport {
	/** `skip` when the provider cannot read or write the property, `cancelled` when the answer was no. */
	status: "ok" | "fail" | "skip" | "cancelled";
	/** The values added, or on a dry run the values that would be. */
	added?: string[];
	/** Why it did not run, when that is so. */
	reason?: string;
}
