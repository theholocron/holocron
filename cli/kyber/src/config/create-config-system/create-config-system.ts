import { dirname } from "node:path";

import { ConfigFileError, loadConfigDir, loadConfigFile } from "@theholocron/datapad";

import type { ConfigFragment } from "../compose-fragments/index.js";
import { composeFragments } from "../compose-fragments/index.js";
import type { ConfigSystem, ConfigSystemOptions } from "./create-config-system.type.js";

/**
 * Build the config system of a new CLI: a `<name>.config.{ts,js,mjs,cjs,json}` file, a typing helper for it, a loader
 * that walks up to the repo root, and a `compose()` that merges reusable fragments. With `areas` and `place`, it also
 * reads the files of a `.<name>/` directory beside the config and hands them to `place` before `derive`.
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
	const { name, areas, shared, place, derive, resolve, merge } = options;
	return {
		defineConfig: (config) => config,
		async loadConfig(cwd) {
			let found = await loadConfigFile<Raw>({ cwd, name, walkUp: true });
			if (!found) {
				throw new ConfigFileError(
					`no ${name}.config.{ts,js,mjs,cjs,json} found in ${cwd}. Create one — see the README for the schema.`
				);
			}
			if (areas && place) {
				const placed = await loadConfigDir({ cwd: dirname(found.filepath), dir: `.${name}`, areas, shared });
				found = { ...found, config: await place(placed, found.config) };
			}
			const raw = derive ? await derive(found) : found.config;
			return { resolved: resolve(raw), filepath: found.filepath };
		},
		compose: (...fragments) => composeFragments<Fragment, Composed>(merge, fragments),
	};
}
