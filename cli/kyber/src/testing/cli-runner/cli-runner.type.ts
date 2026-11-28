/** What a run of a built CLI printed and how it ended. */
export interface CliRun {
	/** Everything written to stdout. */
	stdout: string;
	/** Everything written to stderr. */
	stderr: string;
	/** The exit code; -1 if a signal ended the process (the timeout, or something else, which `stderr` then says). */
	code: number;
	/** True only when the timeout killed the run; `stderr` then ends with a line saying how long it ran and what it printed. */
	timedOut: boolean;
	/** How long the run took, from spawn to close, in milliseconds. */
	elapsedMs: number;
	/** How long node took to run its first line of JavaScript after the spawn, in milliseconds; -1 if it never did. */
	startMs: number;
}

/** What one run of the CLI is given. */
export interface RunCliOptions {
	/** Written to the runner's `configFile` in the working directory. A string is written as it is (for a broken file). */
	config?: object | string;
	/** Added to the controlled environment for this run. */
	env?: Record<string, string>;
	/** How long the run may take, from the moment node starts running, before it is killed. Default 60 seconds. */
	timeoutMs?: number;
	/** How long node may take to start at all (the machine's launch latency, not the tool) before it is killed. Default 50 seconds. */
	startTimeoutMs?: number;
}

/** What {@link createCliRunner} needs to run a tool's built binary. */
export interface CliRunnerOptions {
	/** The built file to run with Node, e.g. `dist/cli.mjs`. */
	bin: string;
	/** The name of the config file, in the working directory, that a run's `config` is written to (`tool.config.json`). */
	configFile?: string;
	/** Added to the controlled environment of every run, such as a switch that turns telemetry off. */
	env?: Record<string, string>;
	/** The start of the temporary working directory's name. Default `cli-`. */
	prefix?: string;
}
