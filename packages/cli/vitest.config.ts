import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

import { rawText } from "./raw-text.js";

const base = library();

export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), rawText()],
	test: {
		...base.test,
		// Override any FORCE_COLOR set by the outer environment (e.g. CI sets
		// FORCE_COLOR=1). Tests assert on plain-text strings without ANSI codes.
		env: { ...base.test?.env, FORCE_COLOR: "0" },
		coverage: {
			...base.test?.coverage,
			exclude: [
				...(base.test?.coverage?.exclude ?? []),
				// CLI entry point — not unit-testable (yargs wiring, process.exit, etc.).
				// See issue #117.
				"src/cli.ts",
				// Pure TypeScript type definitions; no executable logic to cover.
				// See issue #117.
				"src/capabilities/index.ts",
				// Pure re-export shim — all logic lives in @theholocron/http-client.
				"src/rest-client.ts",
				// yml template files — string content only, no executable logic.
				"src/commands/dependabot.yml",
				"src/commands/workflows/**",
				"src/templates/actions/**",
				"src/templates/workflows/**",
				// setup template files — raw text content only, no executable logic.
				"src/commands/setup/templates/**",
			],
		},
	},
});
