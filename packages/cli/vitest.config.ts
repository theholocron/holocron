import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

const base = library();

export default defineConfig({
	...base,
	test: {
		...base.test,
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
			],
		},
	},
});
