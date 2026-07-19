import { defineConfig } from "vitest/config";
import { node } from "../presets/node.js";

// Thresholds accept global numbers and per-file overrides (nested objects).
type Thresholds = Record<
	string,
	number | Record<string, number | undefined> | undefined
>;

/**
 * Vitest bundle for published Node.js libraries.
 * Includes coverage with an 80% threshold on all metrics.
 *
 * Accepts per-file threshold overrides via `thresholds` in options:
 *
 * ```js
 * library({ thresholds: { "src/generated.ts": { lines: 0, functions: 0, branches: 0, statements: 0 } } })
 * ```
 *
 * @param {{ thresholds?: Thresholds, [key: string]: unknown }} [options]
 */
export function library({
	thresholds: thresholdOverrides,
	...rest
}: {
	thresholds?: Thresholds;
	[key: string]: unknown;
} = {}) {
	const base = node(rest);

	return {
		...base,
		test: {
			...base.test,
			coverage: {
				provider: "v8",
				reporter: ["lcov", "text"],
				include: ["src/**/*.ts"],
				exclude: [
					"src/**/__tests__/**",
					"src/**/*.{test,spec}.ts",
					"src/index.ts",
					"**/node_modules/**",
					"**/dist/**",
				],
				thresholds: {
					lines: 80,
					branches: 80,
					functions: 80,
					statements: 80,
					...thresholdOverrides,
				} as Thresholds,
			},
		},
	};
}

/** Ready-to-use config for packages that need no customisation. */
// defineConfig doesn't list coverage in ProjectConfig for v4 workspace configs —
// cast through unknown so the inferred return type passes the overload check.
export default defineConfig(library() as never);
