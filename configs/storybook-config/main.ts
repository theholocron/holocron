import { type StorybookConfig } from "@storybook/react-vite";

export type { StorybookConfig };

export const storybookConfig: StorybookConfig = {
	addons: [
		"@storybook/addon-a11y",
		"@storybook/addon-coverage",
		"@storybook/addon-essentials",
		"@storybook/addon-interactions",
		"@storybook/addon-links",
		"@chromatic-com/storybook",
		"@whitespace/storybook-addon-html",
	],
	docs: {
		defaultName: "Documentation",
	},
	framework: {
		name: "@storybook/react-vite",
		// https://storybook.js.org/docs/api/main-config/main-config-framework
		options: {},
	},
	staticDirs: ["../../../public"],
	stories: [
		"../../../src/**/*.mdx",
		"../../../src/**/*.story.@(js|jsx|mjs|ts|tsx)",
	],
};
