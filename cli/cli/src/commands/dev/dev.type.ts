import type { SuperviseProcessesInput, SuperviseProcessesResult } from "@theholocron/dagobah";
import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { PluginLoader, RuntimeContext } from "../../plugin/index.js";
import type { RunTunnelUpInput, TunnelUpReport } from "../tunnel-up/index.js";

/** Input for {@link runDev}. */
export interface RunDevInput {
	/** The loaded config: its `vault`, `tunnels` and `dns` providers are the ones used. */
	loaded: LoadedConfig;
	/** The runtime context (dry run, tokens, org). */
	context: RuntimeContext;
	/** The vault environment whose variables the application runs with, e.g. `acme/app - dev`. */
	environment: string;
	/** The tunnel's name. */
	name: string;
	/** The public hostname the tunnel serves. */
	hostname: string;
	/** The local port the application listens on (given to it as `PORT`) and the tunnel sends requests to. */
	port: number;
	/** The application's command and arguments. */
	command: string[];
	/** The plugin loader. Defaults to one for `loaded`. */
	loader?: PluginLoader | undefined;
	/** Where the rows go (never a variable's value or the tunnel's token). Defaults to stdout. */
	print?: ((line: string) => void) | undefined;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger | undefined;
	/** Sets up the tunnel and its DNS record. Defaults to {@link runTunnelUp}. */
	ensureTunnel?: ((input: RunTunnelUpInput) => Promise<TunnelUpReport>) | undefined;
	/** Runs the application and the connector. Defaults to {@link superviseProcesses}. */
	runProcesses?: ((input: SuperviseProcessesInput) => Promise<SuperviseProcessesResult>) | undefined;
}

/** What `holocron dev` did. */
export interface DevReport {
	/** `fail` when a step failed or a process ended with an error, otherwise `ok`. */
	status: "ok" | "fail";
	/** The status the run ended with, when the processes were run. */
	exitCode?: number;
	/** Rows that succeeded and rows that failed, for the summary line. */
	summary: { ok: number; fail: number };
}
