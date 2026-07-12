import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

export default defineConfig(
	library({
		thresholds: {
			// CLI entry point — not unit-testable (yargs wiring, process.exit, etc.)
			// Deployment target: src/capabilities/index.ts — pure TypeScript type
			// definitions and interfaces; no executable logic to cover.
			// See issue #117 for tracking coverage improvements in these files.
			"src/cli.ts": { lines: 0, functions: 0, branches: 0, statements: 0 },
			"src/capabilities/index.ts": { lines: 0, functions: 0, branches: 0, statements: 0 },
		},
	})
);
