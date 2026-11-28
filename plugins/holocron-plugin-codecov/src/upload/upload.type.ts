import type { spawnSync } from "node:child_process";

import type { CodecovCli } from "./shell.js";

/** `spawnSync`, injected so a test never starts a process. */
export type SpawnFn = typeof spawnSync;

/** What the Codecov CLI download needs besides the network: where to put the files and how to run `gpg`. */
export interface DownloadCliDeps {
	/** `fetch`, for the binary, its checksum file, the signature and the signing key. */
	fetch: typeof fetch;
	/** Spawns `gpg`. */
	spawn: SpawnFn;
	/** Writes a file. */
	writeFile: (path: string, data: Uint8Array | string) => void;
	/** Makes the file at `path` executable. */
	makeExecutable: (path: string) => void;
	/** Makes a directory (and its parents) with the given mode. */
	makeDir: (path: string, mode?: number) => void;
}

/** Everything {@link uploadCoverage} touches outside itself, so every branch can be reached from a test. */
export interface UploadDeps {
	/** The environment the run reads: `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`. */
	env: (name: string) => string | undefined;
	/** `fetch`, for the OIDC token. */
	fetch: typeof fetch;
	/** Downloads and checks the Codecov CLI, and returns the runner for it. */
	prepareCli: () => Promise<CodecovCli>;
	/** Expands a glob pattern, relative to `cwd`, into file paths (sorted). */
	expandGlob: (pattern: string, cwd: string) => string[];
	/** Reads a report as text. */
	readFile: (path: string) => string;
	/** Writes the rooted copy of a report. */
	writeFile: (path: string, data: string) => void;
	/** Makes a fresh scratch folder for the rooted copies and returns its path. */
	makeTempDir: () => string;
	/** Waits; injected so a retry never sleeps in a test. */
	sleep: (ms: number) => Promise<void>;
	/** Prints a line of progress (names and counts only). */
	log: (line: string) => void;
	/** Masks a value in the log (`::add-mask::`), called with each OIDC token before anything else sees it. */
	mask: (value: string) => void;
}
