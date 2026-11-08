import { MODULE_CACHE_PATH } from "./module-cache.js";

/**
 * How long a test or a hook may run, in milliseconds. Vitest's own 5 s / 10 s catch a hang in a pure unit test, but
 * this preset serves packages whose tests start real processes (the built CLI, `git`, `node`). A process start costs
 * about a second idle and tens of seconds when the machine is saturated (the pre-push hook runs every package's tests
 * at once, beside the linters, and endpoint protection scanning each exec makes it slower still), and a test that
 * makes two runs needs two runs' worth. A budget that low turned load into failures that pass when the test runs
 * alone. A long budget only costs anything when a test really hangs.
 */
export const TEST_TIMEOUT_MS = 120_000;

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
			testTimeout: TEST_TIMEOUT_MS,
			hookTimeout: TEST_TIMEOUT_MS,
			fsModuleCachePath: MODULE_CACHE_PATH,
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
