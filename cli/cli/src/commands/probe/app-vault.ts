import { realpath } from "node:fs/promises";
import { dirname } from "node:path";

import { loadConfig } from "../../config/index.js";
import { type PluginImporter, PluginLoader, type RuntimeContext, type Vault } from "../../plugin/index.js";

/**
 * The vault of an app that carries its own `holocron.config` (`apps/comlink`, `apps/sentinel`): those configs govern where
 * the app's secrets live, apart from the root's. `undefined` when the app has no config of its own (the search for one
 * would otherwise walk up and find the root's), or its config declares no vault, or that config cannot be read.
 */
export async function loadAppVault(
	appDir: string,
	context: RuntimeContext,
	importer?: PluginImporter
): Promise<Vault | undefined> {
	let loaded;
	try {
		loaded = await loadConfig(appDir);
	} catch {
		return undefined;
	}
	const [found, wanted] = await Promise.all([realpath(dirname(loaded.filepath)), realpath(appDir)]);
	if (found !== wanted) return undefined;
	const loader = new PluginLoader(loaded.resolved, { ...context, repoRoot: appDir }, importer);
	await loader.load();
	return loader.has("vault") ? loader.get("vault") : undefined;
}
