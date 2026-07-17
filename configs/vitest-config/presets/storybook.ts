/**
 * Vitest preset for Storybook component testing via @storybook/addon-vitest.
 * Runs stories as browser tests using Playwright.
 *
 * @param {string} [storybookDir='.storybook'] Path to the .storybook directory
 * @param {import('vitest/config').UserProjectConfig['test']} [options]
 * @returns {import('vitest/config').UserProjectConfig}
 */
export async function storybook(storybookDir = ".storybook", options = {}) {
	const { storybookTest } =
		await import("@storybook/addon-vitest/vitest-plugin");

	return {
		plugins: [storybookTest({ storybookDir })],
		test: {
			name: "storybook",
			browser: {
				enabled: true,
				headless: true,
				provider: "playwright",
				instances: [{ browser: "chromium" }],
			},
			...options,
		},
	};
}
