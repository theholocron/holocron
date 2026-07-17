import { defineConfig } from "tsdown";
export default defineConfig({
	entry: [
		"index.ts",
		"presets/node.ts",
		"presets/react.ts",
		"presets/storybook.ts",
		"bundles/library.ts",
		"bundles/react-app.ts",
	],
	format: "esm",
	fixedExtension: false,
	dts: true,
	clean: true,
	deps: { dts: { neverBundle: /.*/ } },
});
