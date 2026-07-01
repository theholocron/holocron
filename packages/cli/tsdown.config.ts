import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/cli.ts", "src/capabilities/index.ts"],
	format: "esm",
	dts: true,
	clean: true,
	// Externalize peer deps + workspace siblings; bundle in everything else.
	// (At publish time, workspace:* deps get rewritten to their real versions
	// by pnpm publish, so consumers resolve them from npm normally.)
	deps: { neverBundle: [/^@theholocron\//] },
});
