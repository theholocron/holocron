import { library } from "@theholocron/vitest-config/bundles/library";
import type { UserConfig } from "vitest/config";

const base = library() as UserConfig;

// src/index.ts is the implementation, not a barrel — override the base
// config's exclusion so it appears in coverage.
export default {
	...base,
	test: {
		...base.test,
		coverage: {
			...base.test?.coverage,
			exclude: [
				"src/**/__tests__/**",
				"src/**/*.{test,spec}.ts",
				"**/node_modules/**",
				"**/dist/**",
			],
		},
	},
} satisfies UserConfig;
