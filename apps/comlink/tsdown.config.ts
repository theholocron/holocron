import { defineConfig } from "tsdown";

/**
 * One self-contained ES module: it is uploaded as a Worker script as it stands, so nothing may be left as an import.
 * The relay has no dependencies, which keeps that true by construction.
 */
export default defineConfig({
	entry: { worker: "src/worker.ts" },
	format: "esm",
	platform: "neutral",
	target: "es2022",
	dts: false,
	clean: true,
	outDir: "dist",
});
