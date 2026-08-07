import { defineConfig, type UserConfig } from "tsdown";

/**
 * tsdown preset for a CLI binary.
 * Builds src/cli.ts → dist/cli.mjs with a Node.js shebang banner.
 * No type declarations — binaries don't need them.
 */
export function cli(options: UserConfig = {}) {
	return defineConfig({
		entry: ["src/cli.ts"],
		format: "esm",
		dts: false,
		clean: true,
		sourcemap: true,
		banner: { js: "#!/usr/bin/env node" },
		...options,
	});
}

export default cli();
