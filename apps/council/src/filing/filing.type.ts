import type { IdeasSettings } from "../settings/settings.type.js";

/** The outcome of checking a note before it is filed. */
export type FileableDecision = { ok: true } | { ok: false; reason: string };

/** The outcome of checking a note after `sync ideas` ran. */
export type TrashDecision = { trash: true; issue: string } | { trash: false; reason: string };

/** A process to start: the program, its arguments, where to run it and the environment it gets on top of the app's. */
export interface SyncCommand {
	program: string;
	args: string[];
	cwd: string;
	env: Record<string, string>;
	/** Set when the login shell was asked for but is not a POSIX shell, so the program runs directly: the shell's name. */
	unsupportedShell?: string;
}

/** This Mac's home folder and login shell, read only on desktop. */
export interface SystemInfo {
	home: string;
	/** An absolute path. */
	shell: string;
}

/** What the process printed (stdout then stderr) and how it ended; `code` is `null` when it did not start or was stopped. */
export interface RunResult {
	code: number | null;
	output: string;
	/** Why it did not run to the end (could not start, timed out). */
	error?: string;
}

/** Everything `fileIdea()` touches, so the decisions and their order can be tested without Obsidian or a shell. */
export interface FileIdeaDeps {
	settings: IdeasSettings;
	/** The vault's folder on disk; `undefined` when the vault is not a local folder. */
	vaultPath: string | undefined;
	isMobile: boolean;
	/** The caller's `PATH`, which the command's own is built on. */
	currentPath: string;
	/** Reads the home folder and login shell; called only on desktop, after the settings are checked. */
	system: () => SystemInfo;
	readNote: () => Promise<string>;
	setStatus: (state: string) => Promise<void>;
	trashNote: () => Promise<void>;
	run: (command: SyncCommand) => Promise<RunResult>;
	notify: (message: string) => void;
	/** Tells the user a run has started (a shell can take a few seconds to start). */
	announce: (message: string) => void;
}
