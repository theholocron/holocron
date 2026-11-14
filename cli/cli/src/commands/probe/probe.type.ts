import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, PluginProbes, ProbeRow, RuntimeContext } from "../../plugin/index.js";
import type { PluginToken } from "../auth/index.js";
import type { MeasureDocsCoverageInput } from "./docs-coverage/index.js";
import type { ChooseToken } from "./probe-token/index.js";

export type ProbePrintLine = (line: string) => void;

export interface RunProbeInput {
	/** `<provider> <probe>`, for the heading and the consent question. */
	name: string;
	provider: string;
	probeName: string;
	/** Words after the probe name, for a probe that takes an argument. */
	args?: readonly string[];
	/** A heading row printed first: which declared token this run checks (its variable name). */
	heading?: string;
	/** `--lcov <path>`: where a coverage probe also writes its lcov report. */
	lcov?: string;
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

/** One run of a probe: the context it runs in (its token), the heading naming that token and the arguments only it gets. */
export interface ProbeStep {
	context: RuntimeContext;
	heading?: string;
	args: string[];
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
	/** Words after the probe name, for a probe that takes an argument. */
	args?: readonly string[];
	/** `--lcov <path>`: where a coverage probe also writes its lcov report. */
	lcov?: string;
	dryRun?: boolean;
	yes?: boolean;
	/** Lets tests inject a loader with mock plugins. */
	loader?: PluginLoader;
	/** Builds the loader again for a context with another token in it; tests inject one that returns their mock plugins. */
	makeLoader?: (context: RuntimeContext) => PluginLoader;
	/** `--environment`: a layer word or Environment name to read the provider's token from, for a probe that accepts a token. */
	environment?: string;
	/** Asks which token to check; given only on a terminal, and used when neither `--token` nor `--environment` was. */
	chooseToken?: ChooseToken;
	/** The tokens a provider's plugin lists (their variable names); the real one imports the plugin package. */
	providerTokens?: (provider: string) => Promise<readonly PluginToken[]>;
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
