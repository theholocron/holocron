import { readFileSync } from "node:fs";

import { defineConfig } from "tsdown";
import type { Plugin } from "rollup";

/** Rollup plugin: import *.yml files as default-exported strings. */
function rawYml(): Plugin {
	return {
		name: "raw-yml",
		transform(_code, id) {
			if (!id.endsWith(".yml")) return null;
			return {
				code: `export default ${JSON.stringify(readFileSync(id, "utf8"))};`,
				map: null,
			};
		},
	};
}

const sharedDeps = { neverBundle: [/^@theholocron\//] };
const sharedPlugins = [rawYml()];

export default defineConfig([
	{
		// Library + capabilities: types generated here; dist is cleaned first.
		entry: ["src/index.ts", "src/capabilities/index.ts"],
		format: "esm",
		dts: true,
		clean: true,
		deps: sharedDeps,
		plugins: sharedPlugins,
	},
	{
		// CLI binary: compiled to plain JS — shebang must use node, not tsx.
		entry: ["src/cli.ts"],
		format: "esm",
		dts: false,
		clean: false,
		deps: sharedDeps,
		banner: { js: "#!/usr/bin/env node" },
		plugins: sharedPlugins,
	},
]);
