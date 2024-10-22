import storybook from "eslint-plugin-storybook";

/**
 * @see https://eslint.org/docs/latest/use/configure/
 * @type {import("eslint").Linter.Config}
 */
export default [...storybook.configs["flat/recommended"]];
