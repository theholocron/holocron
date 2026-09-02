import { defineConfig } from "tsdown";

import { rawText } from "./raw-text.js";

const sharedDeps = { neverBundle: [/^@theholocron\//] };
const sharedPlugins = [rawText()];

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
		sourcemap: true,
		deps: sharedDeps,
		banner: { js: "#!/usr/bin/env node" },
		plugins: sharedPlugins,
	},
]);
