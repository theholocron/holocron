import { dirname } from "node:path";

import { type LoadedConfig, resolvePluginPackage } from "../../../config/index.js";
import { type AuthImporter, createDefaultImporter, type PluginToken } from "../../auth/index.js";

/**
 * Reads the tokens a provider's plugin lists (its module-level `tokens`), resolving the plugin package from the
 * directory of the config that was loaded so a `--cwd` run finds the plugins installed there.
 */
export function defaultProviderTokens(
	loaded: Pick<LoadedConfig, "filepath">,
	importer: AuthImporter = createDefaultImporter(dirname(loaded.filepath))
): (provider: string) => Promise<readonly PluginToken[]> {
	return async (provider) => (await importer(resolvePluginPackage(provider))).tokens ?? [];
}
