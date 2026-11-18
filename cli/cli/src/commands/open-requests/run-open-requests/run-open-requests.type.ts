import type { GitIgnoreState } from "@theholocron/kyber/secrets";
import type { CheckRow } from "@theholocron/kyber/ui";

import type { LoadedConfig } from "../../../config/index.js";
import type { PluginLoader, RuntimeContext, ToolingOpenPlan } from "../../../plugin/index.js";

/** What is at a path, as `open requests` needs to tell it apart. */
export type PathState =
	{ kind: "none" } | { kind: "symlink"; to: string } | { kind: "file"; firstLine: string } | { kind: "other" };

/**
 * Everything `open requests` does outside its own logic: the file system, the process list, the terminal signals and the
 * program it starts. Injected so each path is tested without Bruno, 1Password or a real signal.
 */
export interface OpenRequestsDeps {
	/** Whether git ignores the path. */
	isIgnored(path: string): GitIgnoreState;
	/** Makes the private directory (owner-only) when it is not there. */
	makeDir(dir: string): void;
	/** Writes a new file only its owner can read; throws when the path exists. */
	createPrivateFile(path: string, text: string): void;
	/** What is at the path, without following a symlink. */
	inspect(path: string): PathState;
	/** Makes `link` a symlink to `to`. */
	symlink(to: string, link: string): void;
	/** Removes the file or symlink; nothing when it is not there. */
	remove(path: string): void;
	/** Makes the lock file, holding `pid`; false when the lock is held by a process that is still running. */
	takeLock(path: string, pid: number): boolean;
	/** The command lines of the running processes, one per line. */
	processes(): Promise<string>;
	/** Starts the program and resolves with its exit code when it ends. */
	run(launch: ToolingOpenPlan["launch"]): Promise<number>;
	/** Calls `handler` once on SIGINT, SIGTERM, SIGHUP or exit; returns what undoes the registration. */
	onTerminate(handler: () => void): () => void;
	/** This process's id, for the lock. */
	pid: number;
	/** The platform; the symlink and the file's mode need a Unix one. */
	platform: NodeJS.Platform;
}

/** What {@link runOpenRequests} needs. */
export interface RunOpenRequestsInput {
	/** The repo's config: its `tooling` providers and the `vault` that holds the Environment. */
	loaded: LoadedConfig;
	/** The runtime context; `dryRun` lists the names and starts nothing. */
	context: RuntimeContext;
	/** The layer (`local`, `dev`, `ci`, `prod`) or a named Environment to read; default `dev`. */
	environment?: string;
	/** Open only for this tooling provider. */
	to?: string;
	/** Go ahead without asking (required without a terminal). */
	yes?: boolean;
	/** Loads the providers. Defaults to a loader over the config. */
	loader?: PluginLoader;
	/** Whether a terminal can be asked. Defaults to whether stdin is one. */
	interactive?: boolean;
	/** Asks the yes/no question. Defaults to an inquirer prompt. */
	confirm?: (message: string) => Promise<boolean>;
	/** The collaborators; the defaults touch the real system. */
	deps?: Partial<OpenRequestsDeps>;
	/** Where the lines go. Defaults to the console. */
	print?: (line: string) => void;
}

/** How an `open requests` run went. */
export interface OpenRequestsReport {
	/** `fail` if a row failed, `cancelled` when the person said no, otherwise `ok`. */
	status: "ok" | "fail" | "cancelled";
	/** The rows that were printed. */
	rows: CheckRow[];
}
