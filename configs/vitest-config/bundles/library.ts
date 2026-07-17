import { defineConfig } from "vitest/config";
import { node } from "../presets/node.js";

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
 * @param {{ thresholds?: import('vitest/config').CoverageV8Options['thresholds'], [key: string]: unknown }} [options]
 * @returns {import('vitest/config').UserProjectConfig}
 */
export function library({ thresholds: thresholdOverrides, ...rest } = {}) {
	const base = node(rest);

	return {
		...base,
		test: {
			...base.test,
			coverage: {
				provider: "v8",
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
				},
			},
		},
	};
}

/** Ready-to-use config for packages that need no customisation. */
export default defineConfig(library());
