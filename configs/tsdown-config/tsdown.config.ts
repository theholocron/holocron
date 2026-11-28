import { defineConfig } from "tsdown";
export default defineConfig({
	entry: ["index.ts", "presets/cli.ts", "presets/library.ts"],
	format: "esm",
	fixedExtension: false,
	dts: true,
	clean: true,
});
