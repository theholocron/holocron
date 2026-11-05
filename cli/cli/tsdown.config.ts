import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { defineConfig } from "tsdown";

// `@theholocron/dagobah` and `@theholocron/kyber` are private and never published, so they are inlined (their npm imports
// stay external, and so must be dependencies of this package); every other workspace package is a dependency.
const sharedDeps = {
	neverBundle: [/^@theholocron\/(?!(?:dagobah|kyber)(?:\/|$))/, /^tsx(?:\/|$)/],
	alwaysBundle: [/^@theholocron\/(?:dagobah|kyber)(?:\/|$)/],
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
