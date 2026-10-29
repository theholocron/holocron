import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, PluginProbes, ProbeRow, RuntimeContext } from "../../plugin/index.js";
import type { MeasureDocsCoverageInput } from "./docs-coverage/index.js";

export type ProbePrintLine = (line: string) => void;

export interface RunProbeInput {
	/** `<provider> <probe>`, for the heading and the consent question. */
	name: string;
	provider: string;
	probeName: string;
	probe: PluginProbes[string];
	dryRun: boolean;
	/** `--yes`: do not ask before a probe that writes. */
	yes: boolean;
	/** Values that must never be printed (tokens), on top of the ones a probe marks. */
	secrets?: readonly string[];
	print?: ProbePrintLine;
	/** Whether a person can answer a question. Defaults to whether stdin is a terminal. */
	interactive?: boolean;
	/** Asks a yes/no question. Defaults to an `@inquirer/prompts` confirm. */
	confirm?: (message: string) => Promise<boolean>;
	/** Registers what to do on Ctrl-C and returns how to stop listening. Defaults to a one-shot SIGINT handler. */
	onInterrupt?: (handler: () => Promise<void>) => () => void;
}

export interface ProbeReport {
	status: "ok" | "fail" | "cancelled";
	rows: ProbeRow[];
}

export interface RunProbeCommandInput {
	loaded: LoadedConfig;
	context: RuntimeContext;
	provider?: string;
	probe?: string;
	dryRun?: boolean;
	yes?: boolean;
	/** Lets tests inject a loader with mock plugins. */
	loader?: PluginLoader;
	/** Replaces the repo's TypeDoc for the `docs` probes. */
	typedoc?: MeasureDocsCoverageInput["typedoc"];
	print?: ProbePrintLine;
	interactive?: boolean;
	confirm?: RunProbeInput["confirm"];
	onInterrupt?: RunProbeInput["onInterrupt"];
	/**
	 * Opens a menu of the probes instead of printing the list, when no provider is named. Given only on a terminal, so
	 * a pipe or CI still gets the plain list.
	 */
	pick?: (groups: ReadonlyMap<string, PluginProbes>) => Promise<void>;
}

export interface ProbeCommandReport {
	status: "ok" | "fail" | "cancelled" | "listed";
}
