import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { defineConfig } from "tsdown";

// Every workspace package, `@theholocron/dagobah` and `@theholocron/kyber` included, is a published dependency, not inlined.
const sharedDeps = {
	neverBundle: [/^@theholocron\//, /^tsx(?:\/|$)/],
};
const sharedPlugins = [transformTemplate()];

export default defineConfig([
	{
		// Library + capabilities: types generated here; dist is cleaned first.
		// Object form pins the output names: dist/index.mjs, dist/plugin/capabilities.mjs, and dist/presets.mjs.
		entry: {
			index: "src/index.ts",
			"plugin/capabilities": "src/plugin/capabilities/index.ts",
			presets: "src/presets/index.ts",
		},
		format: "esm",
		dts: true,
		clean: true,
		deps: sharedDeps,
		plugins: sharedPlugins,
	},
	{
		// CLI binary: compiled to plain JS — shebang must use node, not tsx. The object form pins the output name,
		// dist/cli.mjs (the package's `bin`), whatever folder the entry sits in.
		entry: { cli: "src/cli/cli.ts" },
		format: "esm",
		dts: false,
		clean: false,
		sourcemap: true,
		deps: sharedDeps,
		banner: { js: "#!/usr/bin/env node" },
		plugins: sharedPlugins,
	},
]);
