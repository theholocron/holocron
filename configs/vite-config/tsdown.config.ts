import { defineConfig } from "tsdown";
export default defineConfig({
	entry: [
		"index.ts",
		"presets/library.ts",
		"presets/react-app.ts",
		"presets/node-app.ts",
	],
	format: "esm",
	fixedExtension: false,
	dts: true,
	clean: true,
});
