import { transformTemplate } from "@theholocron/rollup-plugin-transform-template";
import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

const base = library();

export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), transformTemplate()],
	test: {
		...base.test,
		// Override any FORCE_COLOR set by the outer environment (e.g. CI sets
		// FORCE_COLOR=1). Tests assert on plain-text strings without ANSI codes.
		env: { ...base.test?.env, FORCE_COLOR: "0" },
		// Builds dist/cli.mjs when it is missing or stale, for the tests that run the built CLI (src/cli-binary.test.ts).
		globalSetup: ["./src/testing/build-cli.ts"],
		setupFiles: [...(base.test?.setupFiles ?? []), "./src/testing/silence-logger.ts"],
		coverage: {
			...base.test?.coverage,
			exclude: [
				...(base.test?.coverage?.exclude ?? []),
				// CLI entry point: only wiring now (the global options, the middleware, the error handling and one
				// `.command(...)` per module), and it runs on import, so no unit test can load it. What it does at the
				// top level is checked by running the built CLI (src/cli-binary.test.ts); each command is tested in its
				// own module. See issues #117 and #1190.
				"src/cli.ts",
				// Test-only helpers.
				"src/testing/**",
				// Pure TypeScript type definitions; no executable logic to cover.
				// See issue #117.
				"src/plugin/capabilities.ts",
				// Pure re-export shim — all logic lives in @theholocron/http-client.
				"src/plugin/rest-client.ts",
				// Pure barrel re-exports — no executable logic, v8 tracks 0%.
				"src/commands/setup/index.ts",
				// yml/md template files — string content only, no executable logic.
				"src/templates/**",
			],
		},
	},
});
