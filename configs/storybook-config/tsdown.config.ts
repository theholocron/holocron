import { defineConfig } from "tsdown";
export default defineConfig({
	entry: ["index.ts", "main.ts", "preview.ts", "test-runner.ts"],
	format: "esm",
	fixedExtension: false,
	dts: true,
	clean: true,
});
