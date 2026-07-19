/**
 * Vitest preset for Storybook component testing via @storybook/addon-vitest.
 * Runs stories as browser tests using Playwright.
 *
 * @param {string} [configDir='.storybook'] Path to the .storybook config directory
 * @param {import('vitest/config').UserProjectConfig['test']} [options]
 * @returns {import('vitest/config').UserProjectConfig}
 */
export async function storybook(configDir = ".storybook", options = {}) {
	const { storybookTest } =
		await import("@storybook/addon-vitest/vitest-plugin");

	return {
		plugins: [storybookTest({ configDir })],
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
