import { defineConfig } from "tsdown";

import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";

const sharedDeps = { neverBundle: [/^@theholocron\//] };
const sharedPlugins = [transformTemplate({ dirs: ["/src/templates/configs/"] })];

export default defineConfig([
	{
		// Library + capabilities: types generated here; dist is cleaned first.
		entry: ["src/index.ts", "src/plugin/capabilities.ts"],
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
