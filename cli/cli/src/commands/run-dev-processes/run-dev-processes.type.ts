import type { spawn } from "node:child_process";

/** One process to run in the foreground. */
export interface DevProcess {
	/** The program. */
	command: string;
	/** Its arguments. */
	args: string[];
	/** Variables added to the environment this process is started with. */
	env?: Record<string, string> | undefined;
}

/** Input for {@link runDevProcesses}. */
export interface RunDevProcessesInput {
	/** The application being developed. */
	app: DevProcess;
	/** The tunnel's connector. */
	connector: DevProcess;
	/** Starts a process. Defaults to `spawn`. */
	spawn?: typeof spawn | undefined;
}

/** How the two processes ended. */
export interface DevProcessesResult {
	/** `0` when it was stopped with Ctrl-C or a termination signal; otherwise the status of the one that ended first. */
	exitCode: number;
	/** Which one ended first. */
	endedFirst: "app" | "connector";
	/** Whether this process was told to stop (Ctrl-C, a termination signal), as opposed to one of them ending on its own. */
	interrupted: boolean;
}
