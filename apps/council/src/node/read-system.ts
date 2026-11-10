import { createEnvLookup } from "@theholocron/env-utils/lookup";

import type { SystemInfo } from "../filing/filing.type.js";
import { pickShell } from "../filing/pick-shell.js";

/** The parts of Node's `os` module this needs. */
export interface OsLike {
	homedir: () => string;
	userInfo: () => { shell: string | null };
}

/** Builds the system facts from an `os` and the `SHELL` value; separate from `readSystem()` so it can be tested with fakes. */
export function describeSystem(os: OsLike, envShell: string | undefined): SystemInfo {
	return { home: os.homedir(), shell: pickShell(os.userInfo().shell, envShell) };
}

/**
 * This Mac's home folder and login shell. `os` is loaded here, on first use, like `child_process` in `run-command.ts`:
 * the plugin also loads on iOS, where there is no Node. Only desktop calls this.
 */
export function readSystem(): SystemInfo {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- the lazy load is the point
	const os = require("os") as typeof import("node:os");
	return describeSystem(os, createEnvLookup().get("SHELL"));
}
