import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { defineConfig } from "tsdown";

const sharedDeps = { neverBundle: [/^@theholocron\//] };
const sharedPlugins = [transformTemplate()];

export default defineConfig([
	{
		// Library + capabilities: types generated here; dist is cleaned first.
		// Object form pins the output names: dist/index.mjs and dist/plugin/capabilities.mjs.
		entry: { index: "src/index.ts", "plugin/capabilities": "src/plugin/capabilities/index.ts" },
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
