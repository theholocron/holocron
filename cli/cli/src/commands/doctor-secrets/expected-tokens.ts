import type { LoadedConfig } from "../../config/index.js";
import { type AuthImporter, defaultImporter } from "../auth/index.js";
import { configuredPackages } from "./configured-packages.js";
import type { ExpectedToken } from "./doctor-secrets.type.js";

/**
 * The `envName` of every token the configured plugins list (their `tokens` export), once each, in plain code-unit order
 * so the output is the same on every machine. A name any plugin needs is not `optional`, even if another plugin lists
 * it as optional. A plugin that cannot be loaded lists none.
 *
 * @param input - The loaded config and, for a test, the importer that loads a plugin package.
 */
export async function expectedTokens(input: {
	loaded: Pick<LoadedConfig, "resolved">;
	importer?: AuthImporter;
}): Promise<ExpectedToken[]> {
	const importer = input.importer ?? defaultImporter;
	const optionalOnly = new Map<string, boolean>();
	for (const pkg of configuredPackages(input)) {
		try {
			for (const token of (await importer(pkg)).tokens ?? []) {
				optionalOnly.set(token.envName, (optionalOnly.get(token.envName) ?? true) && token.optional === true);
			}
		} catch {
			// A plugin that cannot be loaded lists none.
		}
	}
	return [...optionalOnly.keys()].sort().map((name) => ({ name, optional: optionalOnly.get(name) === true }));
}
