import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, ProviderRow, RuntimeContext } from "../../plugin/index.js";
import type { GlobalArgs } from "../global-args/index.js";

/** The two things a provider may offer next to its capabilities. */
export type ProviderActionName = "setup" | "doctor";

export interface RunProviderInput {
	/** The loaded config. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` and the tokens (kept out of the output) come from here. */
	context: RuntimeContext;
	/** Which provider (omit to list the ones that offer `setup` or `doctor`). */
	provider?: string;
	/** `setup` or `doctor` (omit to list the provider's). */
	action?: string;
	/** `--yes`: do not ask before `setup` changes things (required without a terminal). */
	yes?: boolean;
	/** Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Where the rows and the closing count go. Defaults to the console. */
	print?: (line: string) => void;
	/** Whether a person can answer a question. Defaults to whether stdin is a terminal. */
	interactive?: boolean;
	/** Asks a yes/no question. Defaults to an `@inquirer/prompts` confirm. */
	confirm?: (message: string) => Promise<boolean>;
}

export interface ProviderReport {
	/** `fail` if a row failed, `listed` for a listing, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "listed" | "cancelled";
	rows: ProviderRow[];
}

/** The arguments of `holocron provider`. */
export interface ProviderArgs extends GlobalArgs {
	provider?: string;
	action?: string;
	yes: boolean;
}
