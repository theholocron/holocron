import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";

const base = library();

export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), transformTemplate({ dirs: ["/src/templates/configs/"] })],
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
				"src/plugin/capabilities.ts",
				// Pure re-export shim — all logic lives in @theholocron/http-client.
				"src/plugin/rest-client.ts",
				// yml/md template files — string content only, no executable logic.
				"src/commands/setup-workflows/workflows/**",
				"src/templates/**",
				// setup template files — raw text content only, no executable logic.
				"src/templates/configs/**",
			],
		},
	},
});
