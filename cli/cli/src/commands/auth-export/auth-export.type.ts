import type { Logger } from "@theholocron/observability/core";

import type { FileIdentity, GitIgnoreState, ShredOutcome } from "../../auth/index.js";
import type { LoadedConfig } from "../../config/index.js";
import type { AuthImporter } from "../auth/index.js";

/**
 * What stdout is. A token is never written to a `terminal` (it would sit in scrollback) or to `other` (a redirect to
 * a regular file, which would leave plaintext tokens on disk without the protections of the file option); only a
 * `pipe` receives the lines. On a terminal they go to the file option instead, or the clipboard when asked.
 */
export type AuthExportOutKind = "terminal" | "pipe" | "other";

/** Where to put the lines instead of stdout: a private file, or the clipboard. */
export type AuthExportTarget = "file" | "clipboard";

export interface RunAuthExportInput {
	/** The loaded config: its providers say which plugins to ask for the tokens they take. */
	loaded: LoadedConfig;
	/** Writes the `NAME=value` lines when stdout is a pipe. In the command this is stdout. */
	out: (text: string) => void;
	/** What stdout is. Required, so a caller cannot forget it and have tokens written to a terminal or a file. */
	outKind: AuthExportOutKind;
	/**
	 * Where to put the lines. Unset, a terminal gets the file and a pipe gets stdout. `clipboard` copies them even
	 * when stdout is a pipe, and `file` writes the file even then.
	 */
	to?: AuthExportTarget;
	/** The file for the file option, relative to the config's directory. Defaults to `.credentials`. */
	file?: string;
	/** Replace the file if it is already there. Without it an existing file is never overwritten. */
	force?: boolean;
	/** Leave the file in place instead of deleting it once the import is done. */
	keep?: boolean;
	/** Whether there is a terminal to ask on (stdin). Without one the file is left and the command says to delete it. */
	interactive?: boolean;
	/** Puts text on the system clipboard. Defaults to `clipboardy`, which uses the platform's own tool. */
	copy?: (text: string) => Promise<void>;
	/** Writes the private file and says which file it is. Defaults to {@link writeCredentialsFile}. */
	writeFile?: (path: string, text: string, force: boolean) => FileIdentity;
	/** Overwrites and removes the file it was written as. Defaults to {@link shredFile}. */
	shred?: (path: string, identity: FileIdentity) => ShredOutcome;
	/** What git says about the path. Defaults to asking git. */
	isIgnored?: (path: string) => GitIgnoreState;
	/** The platform, for refusing the file where its mode means nothing. Defaults to the running one. */
	platform?: string;
	/** Waits for the user to finish importing. Defaults to waiting for Enter on the terminal. */
	waitForImport?: (message: string) => Promise<unknown>;
	/** Also take a token that is set in the environment, ahead of the keyring. */
	fromEnv?: boolean;
	/** Loads a plugin package for its `tokens`. Defaults to resolving from the directory of the loaded config. */
	importer?: AuthImporter;
	/** Environment to read with {@link RunAuthExportInput.fromEnv}. Defaults to the process environment. */
	env?: NodeJS.ProcessEnv;
	/** Reads a keyring entry, or null. Defaults to the OS keyring. */
	keyring?: (key: string) => string | null;
	/** Whether the OS keyring can be reached at all. Defaults to asking it. */
	keyringAvailable?: () => boolean;
	/** Where the names and counts go (never a value). Defaults to stderr. */
	print?: (line: string) => void;
	/** Structured-logging sink. Defaults to the command-bound root. */
	logger?: Logger;
}

/** What `holocron auth export` did. Names only; never a value. */
export interface AuthExportReport {
	/** `fail` when it could not write (clipboard, a file, an unreachable keyring), `skip` when no token was found, otherwise `ok`. */
	status: "ok" | "fail" | "skip";
	/** Where the lines went. Absent when nothing was written. */
	destination?: "clipboard" | "file" | "out";
	/** The file the lines were written to, when `destination` is `file` (a path, not a value). */
	file?: string;
	/** The variable names written, in order. */
	exported: string[];
	/** The variable names with no value anywhere. */
	missing: string[];
	/** Names listed by two plugins under different keyring keys: not written, because one variable cannot hold both. */
	conflicts: string[];
	/** Names whose value no dotenv form can carry without changing it: not written. */
	unsupported: string[];
	/** Plugin packages that could not be loaded, so the tokens they take are not in the list. */
	unavailable: string[];
}
