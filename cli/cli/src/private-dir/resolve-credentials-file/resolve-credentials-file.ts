import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { PRIVATE_CREDENTIALS_FILE } from "../private-dir.js";

/** Where a credentials file goes: its absolute path, and whether it is the default one in the private directory. */
export interface CredentialsFileTarget {
	path: string;
	/** True when no `--file` was given, so the file is in `.holocron/.private/` and a missing ignore rule is fixed by `sync`. */
	isDefault: boolean;
}

/**
 * The credentials file for a command: `file` (relative to `base`) when given, else `.holocron/.private/.credentials`
 * under `base`. The default's directory is created when missing (owner-only), because the ignore check can only ask
 * about a path whose directory exists and the file cannot be written without it.
 */
export function resolveCredentialsFile(
	base: string,
	file: string | undefined,
	makeDir: (dir: string) => void = (dir) => void mkdirSync(dir, { recursive: true, mode: 0o700 })
): CredentialsFileTarget {
	if (file) return { path: resolve(base, file), isDefault: false };
	const path = resolve(base, PRIVATE_CREDENTIALS_FILE);
	makeDir(dirname(path));
	return { path, isDefault: true };
}
