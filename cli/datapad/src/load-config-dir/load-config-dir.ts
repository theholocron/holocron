import { findRoot } from "@theholocron/fs-utils";

import { loadConfigDirArea } from "../load-config-dir-area/index.js";
import type { ConfigDirArea, LoadConfigDirOptions } from "./load-config-dir.type.js";

/**
 * Load the area files of a config directory: for each name in `options.areas`, the first of
 * `<cwd>/<dir>/<area>.{ts,js,mjs,cjs,json}` that exists, loaded the way {@link loadConfigFile} loads a config. Areas
 * with no file are left out, so a missing directory returns `[]`. When one area has files in two formats, the
 * extension priority picks one (`.ts` over `.json`). Throws {@link ConfigFileError} when a file exists but cannot be
 * loaded. Holocron-agnostic: the directory and the area names are parameters, and what an area means is the caller's.
 *
 * Areas named in `options.shared` are also looked up in the repository root's directory (see
 * {@link LoadConfigDirOptions.shared}), so a config in a subdirectory can inherit what the repo declares once.
 */
export async function loadConfigDir<T = unknown>(options: LoadConfigDirOptions): Promise<ConfigDirArea<T>[]> {
	const shared = options.shared ?? [];
	const root = shared.length > 0 ? await findRoot(options.cwd, ".git") : undefined;
	const inheritFrom = root !== undefined && root !== options.cwd ? root : undefined;
	const areas: ConfigDirArea<T>[] = [];
	for (const area of options.areas) {
		const own = await loadConfigDirArea<T>(options.cwd, options.cwd, options.dir, area, options.extensions);
		const inherited =
			inheritFrom !== undefined && shared.includes(area)
				? await loadConfigDirArea<T>(inheritFrom, options.cwd, options.dir, area, options.extensions)
				: undefined;
		const found = own && inherited ? { ...own, root: inherited } : (own ?? inherited);
		if (found) areas.push(found);
	}
	return areas;
}
