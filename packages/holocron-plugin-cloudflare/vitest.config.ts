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
				// Shared cfOk test-fixture helper — not production source.
				"src/helpers.ts",
			],
		},
	},
});
