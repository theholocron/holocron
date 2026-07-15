/**
 * @see https://commitlint.js.org/reference/configuration.html
 * @type {import("@commitlint/types").UserConfig}
 */
const config = {
	extends: ["@commitlint/config-conventional"],
	ignores: [(message) => /^chore\(deps(-dev)?\): Bump/.test(message)],
};

export default config;
