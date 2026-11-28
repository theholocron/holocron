import { join } from "node:path";

import { isFile } from "../is-file/index.js";
import type { Loaded } from "../load-config-file/index.js";
import { loadFile } from "../load-file/index.js";

/**
 * Probe `dir` for `<name>.config.<ext>` in extension-priority order,
 * loading and returning the first match. The one piece of per-directory
 * orchestration `loadConfigFile` needs on both its non-walking and
 * walking paths — pulled out so it can be unit-tested directly instead of
 * only through `loadConfigFile`'s full probe/walk behavior.
 */
export async function probeExtensions<T>(
	dir: string,
	name: string,
	extensions: readonly string[]
): Promise<Loaded<T> | undefined> {
	for (const ext of extensions) {
		const filepath = join(dir, `${name}.config.${ext}`);
		if (!(await isFile(filepath))) continue;
		return { config: await loadFile<T>(filepath, ext), filepath };
	}
	return undefined;
}
