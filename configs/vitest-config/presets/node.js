/**
 * Vitest preset for Node.js libraries and CLI tools.
 * No DOM globals; runs tests in the Node environment.
 *
 * @param {import('vitest/config').UserProjectConfig['test']} [options]
 * @returns {import('vitest/config').UserProjectConfig}
 */
export function node(options = {}) {
	return {
		test: {
			environment: "node",
			include: ["**/*.{test,spec}.{js,ts,mjs}"],
			exclude: ["**/node_modules/**", "**/dist/**"],
			reporters: ["default", "junit"],
			outputFile: {
				junit: "./test-report.junit.xml",
			},
			...options,
		},
	};
}
