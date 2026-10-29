import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { defineConfig } from "tsdown";

const sharedDeps = { neverBundle: [/^@theholocron\//] };
const sharedPlugins = [transformTemplate()];

export default defineConfig([
	{
		// Library + capabilities: types generated here; dist is cleaned first.
		// Object form pins the output names: dist/index.mjs, dist/plugin/capabilities.mjs, dist/presets.mjs and dist/presets/<name>.mjs.
		entry: {
			index: "src/index.ts",
			"plugin/capabilities": "src/plugin/capabilities/index.ts",
			presets: "src/presets/index.ts",
			"presets/node": "src/presets/configs/node.ts",
			"presets/node-docs": "src/presets/configs/node-docs.ts",
			"presets/nextjs": "src/presets/configs/nextjs.ts",
			"presets/react": "src/presets/configs/react.ts",
			"presets/monorepo": "src/presets/configs/monorepo.ts",
		},
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
