import storybook from "eslint-plugin-storybook";
import type { Linter } from "eslint";

export function storybookConfig(): Linter.FlatConfig[] {
	return [...storybook.configs["flat/recommended"]];
}

export { storybookConfig as storybook };
