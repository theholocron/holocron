import { defineConfig } from "tsdown";

const sharedDeps = { neverBundle: [/^@theholocron\//] };

export default defineConfig([
	{
		// Library + capabilities: types generated here; dist is cleaned first.
		entry: ["src/index.ts", "src/capabilities/index.ts"],
		format: "esm",
		dts: true,
		clean: true,
		deps: sharedDeps,
	},
	{
		// CLI binary: compiled to plain JS — shebang must use node, not tsx.
		entry: ["src/cli.ts"],
		format: "esm",
		dts: false,
		clean: false,
		deps: sharedDeps,
		banner: { js: "#!/usr/bin/env node" },
	},
]);
