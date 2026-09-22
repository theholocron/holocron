import { defineConfig, type UserConfig } from "tsdown";

import { resolveEntry } from "./resolve-entry.js";

/**
 * tsdown preset for a published ESM library.
 * Single entry point, generates types, does not bundle @theholocron/* peers.
 */
export function library(options: UserConfig = {}) {
	const merged: UserConfig = {
		entry: ["src/index.ts"],
		format: "esm",
		dts: true,
		clean: true,
		deps: { neverBundle: [/^@theholocron\//] },
		...options,
	};
	return defineConfig({ ...merged, entry: resolveEntry(merged.entry) });
}

/** Ready-to-use config for packages that need no customisation. */
export default library();
