import { DEFAULT_EXTENSIONS } from "../default-extensions/index.js";
import type { ConfigSource, ReadConfigSourceOptions } from "./read-config-source.type.js";

/**
 * {@link probeExtensions} for a config that lives somewhere other than the
 * local disk (a GitHub API, a git blob): probes `<name>.config.<ext>` in
 * extension-priority order through `options.fetch`, returning the first file
 * that exists, or `undefined` when none does. Pass the result to
 * `loadConfigFromContent` to execute it exactly as a local file would be.
 */
export async function readConfigSource(options: ReadConfigSourceOptions): Promise<ConfigSource | undefined> {
	for (const extension of options.extensions ?? DEFAULT_EXTENSIONS) {
		const path = `${options.name}.config.${extension}`;
		const content = await options.fetch(path);
		if (content !== undefined) return { path, extension, content };
	}
	return undefined;
}
