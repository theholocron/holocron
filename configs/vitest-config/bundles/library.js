import { node } from "../presets/node.js";

/**
 * Vitest bundle for published Node.js libraries.
 * Includes coverage with an 80% threshold on all metrics.
 *
 * @param {import('vitest/config').UserProjectConfig['test']} [options]
 * @returns {import('vitest/config').UserProjectConfig}
 */
export function library(options = {}) {
	const base = node(options);

	return {
		...base,
		test: {
			...base.test,
			coverage: {
				provider: "v8",
				include: ["src/**"],
				exclude: ["**/*.{test,spec}.*", "**/node_modules/**", "**/dist/**"],
				thresholds: {
					lines: 80,
					branches: 80,
					functions: 80,
					statements: 80,
				},
			},
		},
	};
}
