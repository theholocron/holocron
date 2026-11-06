import type { spawn } from "node:child_process";

/** One process to run in the foreground. */
export interface SupervisedProcess {
	/** The program. */
	command: string;
	/** Its arguments. */
	args: string[];
	/** Variables added to the environment this process is started with, and to it alone. */
	env?: Record<string, string> | undefined;
}

/** Input for {@link superviseProcesses}. */
export interface SuperviseProcessesInput {
	/** The process that matters, e.g. the application being developed. */
	primary: SupervisedProcess;
	/** The process that runs beside it, e.g. a tunnel's connector. */
	companion: SupervisedProcess;
	/** Starts a process. Defaults to `spawn`. */
	spawn?: typeof spawn | undefined;
}

/** How the two processes ended. */
export interface SuperviseProcessesResult {
	/** `0` when it was stopped with Ctrl-C or a termination signal; otherwise the status of the one that ended first (`1` for one killed by a signal). */
	exitCode: number;
	/** Which one ended first. */
	endedFirst: "primary" | "companion";
	/** Whether this process was told to stop (Ctrl-C, a termination signal), as opposed to one of them ending on its own. */
	interrupted: boolean;
}
