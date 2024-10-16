/**
 * @see https://jestjs.io/docs/configuration
 * @type {import("jest").Config}
 */
export default {
	collectCoverage: true,
	collectCoverageFrom: [
		"<rootDir>/src/**/*.{js,jsx,ts,tsx}",
		"!<rootDir>/**/{__mocks__,mocks}/**",
		"!<rootDir>/**/*.{mocks,mock}.js",
		"!<rootDir>/**/{__stories__,stories}/**",
		"!<rootDir>/**/*.{stories,story}/**",
		"!<rootDir>/**/__snapshots__/**",
	],
	coverageThreshold: {
		global: {
			statements: 80,
			branches: 80,
			lines: 80,
			functions: 80,
		},
	},
	modulePathIgnorePatterns: ["<rootDir>/dist/"],
};
