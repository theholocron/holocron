import { react } from "../presets/react.js";

/**
 * Vitest bundle for React applications.
 * Includes jsdom environment and coverage with an 80% threshold.
 *
 * @param {import('vitest/config').UserProjectConfig['test']} [options]
 * @returns {import('vitest/config').UserProjectConfig}
 */
export function reactApp(options = {}) {
	const base = react(options);

	return {
		...base,
		test: {
			...base.test,
			coverage: {
				enabled: true,
				provider: "v8",
				reporter: ["lcov", "text"],
				include: ["src/**"],
				exclude: [
					"**/*.{test,spec}.*",
					"**/*.{story,stories}.*",
					"**/node_modules/**",
					"**/dist/**",
				],
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
