import storybook from "eslint-plugin-storybook";

export function storybookConfig() {
	return [...storybook.configs["flat/recommended"]];
}

export { storybookConfig as storybook };
