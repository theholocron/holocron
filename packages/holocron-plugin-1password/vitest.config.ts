import { library } from "@theholocron/vitest-config/bundles/library";
import { defineConfig } from "vitest/config";

const base = library({
	thresholds: {
		// defaultSpawn fallback (`?? spawnSync`) is untestable without a live `op` binary
		"src/auth.ts": { lines: 80, functions: 80, branches: 50, statements: 80 },
		"src/verify-token.ts": { lines: 80, functions: 80, branches: 50, statements: 80 },
	},
});

export default defineConfig({
	...base,
	test: {
		...base.test,
		coverage: {
			...base.test?.coverage,
			exclude: [
				...(base.test?.coverage?.exclude ?? []),
				// Shared stubSpawn test harness — not production source.
				"src/helpers.ts",
			],
		},
	},
});
