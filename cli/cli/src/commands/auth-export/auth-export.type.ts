import type { Logger } from "@theholocron/observability/core";

import type { LoadedConfig } from "../../config/index.js";
import type { AuthImporter } from "../auth/index.js";

/**
 * Where stdout goes. A token is never written to a `terminal` (it would sit in scrollback), so it is copied instead,
 * and never to `other` (a regular file, which would leave plaintext tokens on disk); only a `pipe` receives the lines.
 */
export type AuthExportOutKind = "terminal" | "pipe" | "other";

export interface RunAuthExportInput {
	/** The loaded config: its providers say which plugins to ask for the tokens they take. */
	loaded: LoadedConfig;
	/** Writes the `NAME=value` lines when stdout is a pipe. In the command this is stdout. */
	out: (text: string) => void;
	/** What stdout is. Required, so a caller cannot forget it and have tokens written to a terminal or a file. */
	outKind: AuthExportOutKind;
	/** Puts text on the system clipboard. Defaults to `clipboardy`, which uses the platform's own tool. */
	copy?: (text: string) => Promise<void>;
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
	/** Where the lines went: the clipboard on a terminal, `out` on a pipe. Absent when nothing was written. */
	destination?: "clipboard" | "out";
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
