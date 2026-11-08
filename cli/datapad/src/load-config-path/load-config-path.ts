import { extname } from "node:path";

import { DEFAULT_EXTENSIONS } from "../default-extensions/index.js";
import { ConfigFileError } from "../errors/index.js";
import { isFile } from "../is-file/index.js";
import { loadFile } from "../load-file/index.js";

const SUPPORTED: readonly string[] = DEFAULT_EXTENSIONS;

/**
 * Load the one file at `filepath`, whatever its name: `.json` is parsed, `.ts` goes through `tsx`, and `.js`, `.mjs`
 * and `.cjs` are imported; the default export is the value. For a file the caller names (a flag's argument) rather
 * than one found by convention.
 *
 * Throws {@link ConfigFileError} when the file is missing, has an extension that is not one of
 * {@link DEFAULT_EXTENSIONS}, or cannot be loaded.
 *
 * @param filepath - Absolute path of the file.
 */
export async function loadConfigPath<T = unknown>(filepath: string): Promise<T> {
	if (!(await isFile(filepath))) throw new ConfigFileError(`${filepath} is not a file`, filepath);
	const extension = extname(filepath).slice(1);
	if (!SUPPORTED.includes(extension)) {
		throw new ConfigFileError(`${filepath} must be a .${SUPPORTED.join(", .")} file`, filepath);
	}
	return loadFile<T>(filepath, extension);
}
