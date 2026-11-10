import type { LoadedConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader, type RuntimeContext } from "../../plugin/index.js";

/**
 * The loader that lists an Environment's variable names. Built with `readCredentials: false`, so the `credentials`
 * providers are loaded but never asked for a value: only `Credentials.inspect` runs, and no value enters the process.
 *
 * @param loaded - The loaded config.
 * @param context - The runtime context.
 * @param importer - Replaces the plugin import, for a test.
 */
export function createNamesLoader(
	loaded: LoadedConfig,
	context: RuntimeContext,
	importer?: PluginImporter
): PluginLoader {
	return new PluginLoader(loaded.resolved, context, importer, { readCredentials: false });
}

/**
 * The loader for the `secrets` and `source` providers that list GitHub names. Built normally, so the `credentials`
 * providers are read into the in-process store and the GitHub plugin finds its token in the usual chain. The token is
 * only used to authenticate; the check never prints or keeps it.
 *
 * @param loaded - The loaded config.
 * @param context - The runtime context.
 * @param importer - Replaces the plugin import, for a test.
 */
export function createGitHubLoader(
	loaded: LoadedConfig,
	context: RuntimeContext,
	importer?: PluginImporter
): PluginLoader {
	return new PluginLoader(loaded.resolved, context, importer);
}
