import { ConfigFileError, loadConfigFile } from "@theholocron/datapad";

import type { ConfigFragment } from "../compose-fragments/index.js";
import { composeFragments } from "../compose-fragments/index.js";
import type { ConfigSystem, ConfigSystemOptions } from "./create-config-system.type.js";

/**
 * Build the config system of a new CLI: a `<name>.config.{ts,js,mjs,cjs,json}` file, a typing helper for it, a loader
 * that walks up to the repo root, and a `compose()` that merges reusable fragments.
 *
 * @example
 * const { defineConfig, loadConfig, compose } = createConfigSystem<Raw, Resolved, Fragment, Composed>({
 *   name: "mycli",
 *   resolve: (raw) => validate(raw),
 *   merge: { plugins: union<string>(), settings: shallowMerge(), title: lastWins() },
 * });
 */
export function createConfigSystem<Raw, Resolved, Fragment extends ConfigFragment, Composed>(
	options: ConfigSystemOptions<Raw, Resolved, Composed>
): ConfigSystem<Raw, Resolved, Fragment, Composed> {
	const { name, derive, resolve, merge } = options;
	return {
		defineConfig: (config) => config,
		async loadConfig(cwd) {
			const found = await loadConfigFile<Raw>({ cwd, name, walkUp: true });
			if (!found) {
				throw new ConfigFileError(
					`no ${name}.config.{ts,js,mjs,cjs,json} found in ${cwd}. Create one — see the README for the schema.`
				);
			}
			const raw = derive ? await derive(found) : found.config;
			return { resolved: resolve(raw), filepath: found.filepath };
		},
		compose: (...fragments) => composeFragments<Fragment, Composed>(merge, fragments),
	};
}
