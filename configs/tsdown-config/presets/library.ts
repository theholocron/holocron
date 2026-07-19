import { defineConfig, type UserConfig } from "tsdown";

/**
 * tsdown preset for a published ESM library.
 * Single entry point, generates types, does not bundle @theholocron/* peers.
 */
export function library(options: UserConfig = {}) {
	return defineConfig({
		entry: ["src/index.ts"],
		format: "esm",
		dts: true,
		clean: true,
		deps: { neverBundle: [/^@theholocron\//] },
		...options,
	});
}

/** Ready-to-use config for packages that need no customisation. */
export default library();
