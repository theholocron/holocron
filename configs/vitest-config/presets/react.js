/**
 * Vitest preset for React component libraries and apps.
 * Uses jsdom for DOM simulation and assumes @testing-library/react.
 *
 * @param {import('vitest/config').UserProjectConfig['test']} [options]
 * @returns {import('vitest/config').UserProjectConfig}
 */
export function react(options = {}) {
	return {
		test: {
			environment: "jsdom",
			globals: true,
			include: ["**/*.{test,spec}.{js,jsx,ts,tsx}"],
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"**/*.{story,stories}.{js,jsx,ts,tsx}",
			],
			...options,
		},
	};
}
