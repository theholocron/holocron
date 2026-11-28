import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

import type { PluginImporter } from "../create-plugin-system/index.js";

/**
 * The importer a plugin loader uses unless it is given another: resolves the package from the current working
 * directory first, so a globally installed CLI finds the plugins of the project it runs in, and falls back to a plain
 * `import()` when that fails.
 */
export const defaultImporter: PluginImporter = async (packageName) => {
	try {
		const localRequire = createRequire(process.cwd() + "/");
		const resolved = localRequire.resolve(packageName);
		return import(pathToFileURL(resolved).href);
	} catch {
		return import(packageName);
	}
};
