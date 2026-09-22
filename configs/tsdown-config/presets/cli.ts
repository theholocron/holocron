import { defineConfig, type UserConfig } from "tsdown";

import { resolveEntry } from "./resolve-entry.js";

/**
 * tsdown preset for a CLI binary.
 * Builds src/cli.ts → dist/cli.mjs with a Node.js shebang banner.
 * No type declarations — binaries don't need them.
 */
export function cli(options: UserConfig = {}) {
	const merged: UserConfig = {
		entry: ["src/cli.ts"],
		format: "esm",
		dts: false,
		clean: true,
		sourcemap: true,
		banner: { js: "#!/usr/bin/env node" },
		...options,
	};
	return defineConfig({ ...merged, entry: resolveEntry(merged.entry) });
}

export default cli();
