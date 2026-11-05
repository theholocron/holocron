import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parse } from "dotenv";

/** The name of the file, at the repo root, that holds a developer's own tokens. */
export const DOTENV_FILE = ".env";

/**
 * Read `<repoRoot>/.env` into a record, or `null` when the file is not there (or cannot be read).
 *
 * Only the repo root is looked at, never the directory the command happens to run in, so a `.env` in a checkout you
 * cloned and ran the CLI from is not trusted. The file is optional: nothing asks for it, and a project that keeps its
 * tokens in a `credentials` provider or the keyring does not need one.
 */
export function readDotenvFile(repoRoot: string): Record<string, string> | null {
	try {
		return parse(readFileSync(join(repoRoot, DOTENV_FILE)));
	} catch {
		return null;
	}
}
