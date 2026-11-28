import { DEFAULT_EXTENSIONS } from "../default-extensions/index.js";
import type { ConfigDirSource, ReadConfigDirSourceOptions } from "./read-config-dir-source.type.js";

/**
 * {@link readConfigSource} for the area files of a config directory (`.holocron/<area>.<ext>`) that live somewhere
 * other than the local disk: for each name in `options.areas`, probes the extensions in priority order through
 * `options.fetch` and keeps the first file that exists. Areas with no file are left out, so a repo with no
 * directory returns `[]`. Write the result with {@link writeConfigDir} and read it back with {@link loadConfigDir}.
 *
 * This reads only the named areas. A caller that lists the whole directory (and so also gets the files an area
 * imports) passes that tree to {@link writeConfigDir} directly.
 */
export async function readConfigDirSource(options: ReadConfigDirSourceOptions): Promise<ConfigDirSource[]> {
	const sources: ConfigDirSource[] = [];
	for (const area of options.areas) {
		for (const extension of options.extensions ?? DEFAULT_EXTENSIONS) {
			const path = `${options.dir}/${area}.${extension}`;
			const content = await options.fetch(path);
			if (content === undefined) continue;
			sources.push({ area, path, extension, content });
			break;
		}
	}
	return sources;
}
