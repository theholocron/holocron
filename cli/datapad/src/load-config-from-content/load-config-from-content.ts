import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Loaded } from "../load-config-file/index.js";
import { loadFile } from "../load-file/index.js";
import type { LoadConfigFromContentOptions } from "./load-config-from-content.type.js";

/**
 * Load config from content that didn't come from a file already on disk —
 * writes it to `<dir>/<name>.config.<extension>` first, then loads it
 * through the exact same path {@link loadConfigFile} uses for a file it
 * discovered itself. Exists because sourcing config content from somewhere
 * other than the local filesystem (a GitHub API fetch, for one — see
 * `@theholocron/sentinel`) doesn't change what loading it correctly means:
 * a `.ts` config still needs real module resolution, `defineConfig` import
 * included, not a re-implemented parser.
 */
export async function loadConfigFromContent<T>(opts: LoadConfigFromContentOptions): Promise<Loaded<T>> {
	const filepath = join(opts.dir, `${opts.name}.config.${opts.extension}`);
	await writeFile(filepath, opts.content, "utf8");
	return { config: await loadFile<T>(filepath, opts.extension), filepath };
}
