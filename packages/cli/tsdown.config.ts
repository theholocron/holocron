import { defineConfig } from "tsdown";

import { rawYml } from "./raw-yml.js";

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
