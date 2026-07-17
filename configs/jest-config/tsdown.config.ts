import { defineConfig } from "tsdown";
export default defineConfig({
	entry: ["jest-preset.ts"],
	format: "esm",
	fixedExtension: false,
	dts: true,
	clean: true,
});
