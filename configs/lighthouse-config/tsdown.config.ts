import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["index.ts"],
	format: ["esm", "cjs"],
	fixedExtension: true,
	dts: true,
	clean: true,
	deps: { dts: { neverBundle: /.*/ } },
});
