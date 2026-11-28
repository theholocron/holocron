import type { LoadedConfig } from "../../config/index.js";

/**
 * The package of every provider the config names, once each. These are the plugins whose `tokens` export says which
 * variables a machine needs.
 *
 * @param input - The loaded config.
 */
export function configuredPackages(input: { loaded: Pick<LoadedConfig, "resolved"> }): string[] {
	const packages = Object.values(input.loaded.resolved.providers).flatMap((entry) =>
		entry.cardinality === "single" ? [entry.tuple.packageName] : entry.tuples.map((t) => t.packageName)
	);
	return [...new Set(packages)];
}
