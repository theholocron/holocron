import { join, relative, sep } from "node:path";

import { DEFAULT_EXTENSIONS } from "../default-extensions/index.js";
import { isFile } from "../is-file/index.js";
import type { ConfigDirArea } from "../load-config-dir/index.js";
import { loadFile } from "../load-file/index.js";

/**
 * Load one area of a config directory: the first of `<root>/<dir>/<area>.{ts,js,mjs,cjs,json}` that exists, or
 * `undefined` when there is none. `path` on the result is relative to `base` (the directory the caller treats as
 * its own), with `/` separators, so an area read from an ancestor directory comes back as `../../.holocron/org.ts`.
 * Throws {@link ConfigFileError} when the file exists but cannot be loaded.
 *
 * @param root - The directory holding `dir`.
 * @param base - The directory `path` is relative to; the same as `root` for the caller's own directory.
 * @param dir - The directory the area lives in, relative to `root`: `".holocron"`.
 * @param area - The area's name.
 * @param extensions - The extension probe order. Default {@link DEFAULT_EXTENSIONS}.
 */
export async function loadConfigDirArea<T = unknown>(
	root: string,
	base: string,
	dir: string,
	area: string,
	extensions: readonly string[] = DEFAULT_EXTENSIONS
): Promise<ConfigDirArea<T> | undefined> {
	for (const extension of extensions) {
		const filepath = join(root, dir, `${area}.${extension}`);
		if (!(await isFile(filepath))) continue;
		const path = relative(base, filepath).split(sep).join("/");
		return { area, path, extension, filepath, value: await loadFile<T>(filepath, extension) };
	}
	return undefined;
}
