import { join } from "node:path";

import { DEFAULT_EXTENSIONS } from "../default-extensions/index.js";
import { isFile } from "../is-file/index.js";
import { loadFile } from "../load-file/index.js";
import type { ConfigDirArea, LoadConfigDirOptions } from "./load-config-dir.type.js";

/**
 * Load the area files of a config directory: for each name in `options.areas`, the first of
 * `<cwd>/<dir>/<area>.{ts,js,mjs,cjs,json}` that exists, loaded the way {@link loadConfigFile} loads a config. Areas
 * with no file are left out, so a missing directory returns `[]`. When one area has files in two formats, the
 * extension priority picks one (`.ts` over `.json`). Throws {@link ConfigFileError} when a file exists but cannot be
 * loaded. Holocron-agnostic: the directory and the area names are parameters, and what an area means is the caller's.
 */
export async function loadConfigDir<T = unknown>(options: LoadConfigDirOptions): Promise<ConfigDirArea<T>[]> {
	const areas: ConfigDirArea<T>[] = [];
	for (const area of options.areas) {
		for (const extension of options.extensions ?? DEFAULT_EXTENSIONS) {
			const path = `${options.dir}/${area}.${extension}`;
			const filepath = join(options.cwd, options.dir, `${area}.${extension}`);
			if (!(await isFile(filepath))) continue;
			areas.push({ area, path, extension, filepath, value: await loadFile<T>(filepath, extension) });
			break;
		}
	}
	return areas;
}
